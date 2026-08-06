"""
Usage / metering — tokens & coûts + snapshots providers.

Table `usage_events` via SQLAlchemy (même DB que users).
"""
from __future__ import annotations

import json
import logging
import os
import queue
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib import error, request

from sqlalchemy import text

from jarvis_core.db.config import describe_backend
from jarvis_core.db.models import UsageEventRow
from jarvis_core.db.session import get_engine, session_scope

logger = logging.getLogger("jarvis.usage")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ── Écriture en tâche de fond ────────────────────────────────────────────────
#
# ⚠ `record_event` était **synchrone** et appelé depuis `async def
# _openrouter_complete` / `_ollama_complete` (`providers.py`). Base injoignable —
# tunnel PostgreSQL non monté, par exemple — et il attendait le timeout psycopg
# **dans la boucle d'événements**. Il ne retardait donc pas seulement sa propre
# requête : il gelait tout le Core, la voix comprise, pendant ~90 s. Sans
# échouer, puisqu'il attrapait tout et se contentait d'un `warning` : on croyait
# à un LLM lent.
#
# Une mesure d'usage est de la **télémétrie**. Elle n'a rien à faire sur le
# chemin d'une réponse utilisateur. D'où :
#
#   LLM → réponse envoyée → (plus tard, ailleurs) écriture en base
#
# Trois décisions, toutes dans le même sens :
#
#   1. **File bornée.** Si la base traîne, on empile jusqu'à `_QUEUE_MAX` puis on
#      **jette**. Perdre des statistiques est acceptable ; figer la voix ne l'est
#      pas. Une file non bornée finirait en mémoire pleine, ce qui est la même
#      panne en plus lent.
#   2. **Un seul fil d'écriture.** Une base à 30 s ne doit pas faire naître trente
#      fils : le pool de connexions serait épuisé par la télémétrie elle-même.
#   3. **Horodatage à l'ENREGISTREMENT, pas à l'écriture.** Un événement écrit
#      30 s plus tard doit porter l'heure où il a eu lieu. Sinon les coûts se
#      décalent vers les moments où la base était lente — exactement les moments
#      qu'on cherche à analyser.

_QUEUE_MAX = 512

_queue: "queue.Queue[dict[str, Any] | None] | None" = None
_worker: threading.Thread | None = None
_lock = threading.Lock()
_dropped = 0


def _drain(q: "queue.Queue[dict[str, Any] | None]") -> None:
    """Fil d'écriture. Il vit et meurt en silence : rien ici ne remonte.

    La file lui est **passée**, pas relue dans la globale : sinon remplacer
    `_queue` ferait lire une file à un fil qui travaille encore sur l'autre, et
    les deux se marcheraient dessus.
    """
    while True:
        row = q.get()
        if row is None:  # signal d'arrêt
            q.task_done()
            return
        try:
            with session_scope() as s:
                s.add(UsageEventRow(**row))
        except Exception as exc:  # noqa: BLE001
            # Journalisé, jamais propagé : l'appelant est parti depuis longtemps.
            logger.warning("usage record failed (arrière-plan) : %s", exc)
        finally:
            q.task_done()


def _ensure_worker() -> "queue.Queue[dict[str, Any] | None]":
    global _queue, _worker
    with _lock:
        if _queue is None:
            _queue = queue.Queue(maxsize=_QUEUE_MAX)
        if _worker is None or not _worker.is_alive():
            # `daemon` : ce fil ne doit jamais retenir l'arrêt du Core. Une
            # statistique en attente ne vaut pas un arrêt qui traîne.
            _worker = threading.Thread(
                target=_drain, args=(_queue,), name="jarvis-usage", daemon=True
            )
            _worker.start()
    return _queue


def record_event(
    *,
    provider: str,
    model: str | None = None,
    tokens_in: int = 0,
    tokens_out: int = 0,
    cost_usd: float = 0.0,
    meta: dict[str, Any] | None = None,
) -> None:
    """Enregistre un usage **sans attendre l'écriture**. Ne bloque jamais.

    Sûr depuis un contexte asynchrone : la fonction rend la main immédiatement,
    quel que soit l'état de la base.
    """
    global _dropped

    row = {
        "provider": provider,
        "model": model or "",
        "tokens_in": int(tokens_in),
        "tokens_out": int(tokens_out),
        "cost_usd": float(cost_usd),
        "meta_json": json.dumps(meta or {}, ensure_ascii=False),
        # Heure de l'événement, pas de son écriture. Cf. décision 3 ci-dessus.
        "created_at": _utc_now().isoformat(),
    }

    try:
        _ensure_worker().put_nowait(row)
    except queue.Full:
        _dropped += 1
        # Un seul avertissement par palier : une base morte produirait sinon
        # autant de lignes de journal que d'événements perdus.
        if _dropped == 1 or _dropped % 100 == 0:
            logger.warning(
                "télémétrie saturée — %d événement(s) perdu(s). La base ne suit "
                "pas ; le chemin utilisateur reste libre.",
                _dropped,
            )
    except Exception as exc:  # noqa: BLE001
        # Même ici on ne remonte rien : aucune mesure ne justifie de casser
        # l'appel qui l'a produite.
        logger.warning("télémétrie indisponible : %s", exc)


def record_event_sync(**kwargs: Any) -> None:
    """Variante bloquante — tests et outils uniquement.

    À ne JAMAIS appeler depuis une coroutine : c'est le défaut qu'on vient de
    corriger.
    """
    row = {
        "provider": kwargs.get("provider", ""),
        "model": kwargs.get("model") or "",
        "tokens_in": int(kwargs.get("tokens_in", 0)),
        "tokens_out": int(kwargs.get("tokens_out", 0)),
        "cost_usd": float(kwargs.get("cost_usd", 0.0)),
        "meta_json": json.dumps(kwargs.get("meta") or {}, ensure_ascii=False),
        "created_at": _utc_now().isoformat(),
    }
    with session_scope() as s:
        s.add(UsageEventRow(**row))


def flush_usage(timeout: float = 5.0) -> bool:
    """Attend que la file se vide. Pour les tests et un arrêt propre.

    Retourne `False` si le délai est dépassé — sans lever : un arrêt ne doit pas
    échouer parce qu'une statistique n'est pas partie.
    """
    if _queue is None:
        return True
    deadline = time.monotonic() + timeout
    while not _queue.empty():
        if time.monotonic() > deadline:
            return False
        time.sleep(0.02)
    return True


def _bucket_sql(granularity: str) -> str:
    """Buckets sur timestamps ISO texte — portable SQLite + PostgreSQL."""
    if granularity == "hour":
        return "substr(created_at, 1, 13)"
    if granularity == "month":
        return "substr(created_at, 1, 7)"
    if granularity == "week":
        # Jour puis regroupement ISO week côté Python si besoin ; SQL = jour
        return "substr(created_at, 1, 10)"
    return "substr(created_at, 1, 10)"


def series(granularity: str = "day", hours_back: int | None = None) -> list[dict[str, Any]]:
    now = _utc_now()
    if hours_back is None:
        hours_back = {
            "hour": 24,
            "day": 24 * 14,
            "week": 24 * 7 * 12,
            "month": 24 * 30 * 12,
        }.get(granularity, 24 * 14)
    since = (now - timedelta(hours=hours_back)).isoformat()
    bucket = _bucket_sql(granularity)

    with session_scope() as s:
        rows = s.execute(
            text(
                f"""
                SELECT {bucket} AS bucket,
                       SUM(tokens_in + tokens_out) AS tokens,
                       SUM(cost_usd) AS cost,
                       SUM(CASE WHEN provider='openrouter' THEN tokens_in+tokens_out ELSE 0 END) AS openrouter,
                       SUM(CASE WHEN provider LIKE 'ollama%' THEN tokens_in+tokens_out ELSE 0 END) AS ollama,
                       SUM(CASE WHEN provider='elevenlabs' THEN tokens_out ELSE 0 END) AS elevenlabs
                FROM usage_events
                WHERE created_at >= :since
                GROUP BY bucket
                ORDER BY bucket ASC
                """
            ),
            {"since": since},
        ).mappings().all()

    points = [
        {
            "bucket": r["bucket"] or "",
            "tokens": int(r["tokens"] or 0),
            "cost": round(float(r["cost"] or 0), 6),
            "openrouter": int(r["openrouter"] or 0),
            "ollama": int(r["ollama"] or 0),
            "elevenlabs": int(r["elevenlabs"] or 0),
        }
        for r in rows
    ]

    if granularity != "week":
        return points

    # Agrège jours → semaines ISO
    weeks: dict[str, dict[str, Any]] = {}
    for p in points:
        try:
            d = datetime.fromisoformat(p["bucket"]).date()
            key = f"{d.isocalendar().year}-W{d.isocalendar().week:02d}"
        except ValueError:
            key = p["bucket"]
        agg = weeks.setdefault(
            key,
            {"bucket": key, "tokens": 0, "cost": 0.0, "openrouter": 0, "ollama": 0, "elevenlabs": 0},
        )
        agg["tokens"] += p["tokens"]
        agg["cost"] = round(agg["cost"] + p["cost"], 6)
        agg["openrouter"] += p["openrouter"]
        agg["ollama"] += p["ollama"]
        agg["elevenlabs"] += p["elevenlabs"]
    return [weeks[k] for k in sorted(weeks)]


def period_totals() -> dict[str, Any]:
    now = _utc_now()
    windows = {
        "hour": now - timedelta(hours=1),
        "day": now - timedelta(days=1),
        "week": now - timedelta(days=7),
        "month": now - timedelta(days=30),
    }
    out: dict[str, Any] = {}
    with session_scope() as s:
        for name, since in windows.items():
            since_s = since.isoformat()
            row = s.execute(
                text(
                    """
                    SELECT SUM(tokens_in+tokens_out) AS tokens, SUM(cost_usd) AS cost,
                           COUNT(*) AS calls
                    FROM usage_events WHERE created_at >= :since
                    """
                ),
                {"since": since_s},
            ).mappings().first()
            by_p = s.execute(
                text(
                    """
                    SELECT provider, SUM(tokens_in+tokens_out) AS tokens, SUM(cost_usd) AS cost
                    FROM usage_events WHERE created_at >= :since
                    GROUP BY provider
                    """
                ),
                {"since": since_s},
            ).mappings().all()
            out[name] = {
                "tokens": int((row["tokens"] if row else 0) or 0),
                "cost": round(float((row["cost"] if row else 0) or 0), 6),
                "calls": int((row["calls"] if row else 0) or 0),
                "by_provider": {
                    r["provider"]: {
                        "tokens": int(r["tokens"] or 0),
                        "cost": round(float(r["cost"] or 0), 6),
                    }
                    for r in by_p
                },
            }
    return out


def _http_json(url: str, headers: dict[str, str], timeout: float = 12.0) -> dict[str, Any]:
    req = request.Request(url, headers=headers, method="GET")
    with request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_openrouter_key() -> dict[str, Any]:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        return {"ok": False, "configured": False, "error": "OPENROUTER_API_KEY absent"}
    base = os.environ.get("JARVIS_OPENROUTER_BASE", "https://openrouter.ai/api/v1").rstrip("/")
    try:
        data = _http_json(
            f"{base}/key",
            {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        )
        d = data.get("data") if isinstance(data, dict) else None
        if not isinstance(d, dict):
            return {"ok": False, "configured": True, "error": "réponse inattendue"}
        return {
            "ok": True,
            "configured": True,
            "label": d.get("label"),
            "usage": d.get("usage"),
            "limit": d.get("limit"),
            "limit_remaining": d.get("limit_remaining"),
            "is_free_tier": d.get("is_free_tier"),
            "rate_limit": d.get("rate_limit"),
        }
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:200]
        return {"ok": False, "configured": True, "error": f"HTTP {exc.code}: {detail}"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "configured": True, "error": str(exc)}


def fetch_elevenlabs_subscription() -> dict[str, Any]:
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        return {"ok": False, "configured": False, "error": "ELEVENLABS_API_KEY absent"}
    headers = {"xi-api-key": key}
    try:
        data = _http_json("https://api.elevenlabs.io/v1/user/subscription", headers)
        return {
            "ok": True,
            "configured": True,
            "tier": data.get("tier"),
            "character_count": data.get("character_count"),
            "character_limit": data.get("character_limit"),
            "remaining": (
                int(data["character_limit"]) - int(data["character_count"])
                if data.get("character_limit") is not None and data.get("character_count") is not None
                else None
            ),
            "next_character_count_reset_unix": data.get("next_character_count_reset_unix"),
            "status": data.get("status"),
        }
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:280]
        try:
            user = _http_json("https://api.elevenlabs.io/v1/user", headers)
            sub = user.get("subscription") if isinstance(user, dict) else None
            if isinstance(sub, dict):
                return {
                    "ok": True,
                    "configured": True,
                    "tier": sub.get("tier"),
                    "character_count": sub.get("character_count"),
                    "character_limit": sub.get("character_limit"),
                    "remaining": (
                        int(sub["character_limit"]) - int(sub["character_count"])
                        if sub.get("character_limit") is not None and sub.get("character_count") is not None
                        else None
                    ),
                    "status": sub.get("status"),
                    "note": "via /v1/user",
                }
        except Exception:  # noqa: BLE001
            pass
        hint = ""
        if exc.code == 401 and "user_read" in detail:
            hint = " — clé ElevenLabs avec permission user_read"
        return {"ok": False, "configured": True, "error": f"HTTP {exc.code}: {detail}{hint}"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "configured": True, "error": str(exc)}


def fetch_ollama_status() -> dict[str, Any]:
    host = (
        os.environ.get("JARVIS_REMOTE_LLM_URL")
        or os.environ.get("OLLAMA_HOST")
        or os.environ.get("JARVIS_OLLAMA_URL")
        or ""
    ).rstrip("/")
    if not host:
        return {"ok": False, "configured": False, "error": "pas d’URL Ollama"}
    if not host.startswith("http"):
        host = f"http://{host}"
    try:
        data = _http_json(f"{host}/api/tags", {}, timeout=5.0)
        models = [
            m.get("name")
            for m in (data.get("models") or [])
            if isinstance(m, dict) and m.get("name")
        ]
        return {
            "ok": True,
            "configured": True,
            "host": host,
            "models": models[:20],
            "model_count": len(models),
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "configured": True, "host": host, "error": str(exc)}


def dashboard_payload(granularity: str = "day") -> dict[str, Any]:
    # Assure tables (Core boot fait déjà Alembic ; usage peut être appelé tôt)
    try:
        get_engine()
    except Exception:  # noqa: BLE001
        pass
    meta = describe_backend()
    return {
        "ok": True,
        "totals": period_totals(),
        "series": series(granularity),
        "granularity": granularity,
        "openrouter": fetch_openrouter_key(),
        "elevenlabs": fetch_elevenlabs_subscription(),
        "ollama": fetch_ollama_status(),
        "db": meta["backend"],
        "generated_at": _utc_now().isoformat(),
    }


async def dashboard_payload_async(granularity: str = "day") -> dict[str, Any]:
    import asyncio

    return await asyncio.to_thread(dashboard_payload, granularity)
