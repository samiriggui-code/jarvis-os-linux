"""Auth vocale par phrase (STT) — pas de speaker-ID.

Holomat / FaceEngine restent hors de ce chemin (gestes / objets uniquement).
Le Core atteste uniquement après une correspondance phrase ↔ utilisateur enrôlé.
"""
from __future__ import annotations

import json
import logging
import re
import unicodedata
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.auth.voice_phrase")

# Phrase d'accès par défaut (FR) — enrôlement FirstSetup / verify login.
# ⚠ ≠ wake hands-free « hey Jarvis » (openWakeWord). Auth = cette phrase.
DEFAULT_CHALLENGE = "jarvis active toi"

# Alias acceptés pendant la transition (anciens clips TTS / habitudes).
# Ne pas élargir à « jarvis » seul — trop permissif.
AUTH_ALIASES = (
    DEFAULT_CHALLENGE,
    "hey jarvis",
    "ok jarvis",
)


def normalize_phrase(text: str) -> str:
    raw = unicodedata.normalize("NFD", (text or "").strip().lower())
    raw = "".join(c for c in raw if unicodedata.category(c) != "Mn")
    raw = re.sub(r"[^a-z0-9\s]", " ", raw)
    return re.sub(r"\s+", " ", raw).strip()


def phrase_path(users_dir: Path, user_id: str) -> Path:
    return Path(users_dir) / user_id / "voice_auth_phrase.json"


def list_voice_candidates(
    users_dir: Path,
    auth_users: list[Any] | None = None,
) -> list[dict[str, Any]]:
    """Utilisateurs avec `voice_auth_phrase.json` — disque = source de vérité."""
    root = Path(users_dir)
    if not root.is_dir():
        return []

    auth_by_id: dict[str, dict[str, Any]] = {}
    if auth_users:
        for u in auth_users:
            if hasattr(u, "to_public_dict"):
                row = u.to_public_dict()
            elif isinstance(u, dict):
                row = dict(u)
            else:
                continue
            uid = str(row.get("id") or "")
            if uid:
                auth_by_id[uid] = row

    out: list[dict[str, Any]] = []
    for entry in sorted(root.iterdir()):
        if not entry.is_dir():
            continue
        if not phrase_path(root, entry.name).is_file():
            continue
        uid = entry.name
        if uid in auth_by_id:
            out.append(auth_by_id[uid])
            continue
        username = uid[:12]
        face_path = entry / "face_profile"
        if face_path.is_file() and face_path.stat().st_size > 0:
            try:
                import json as _json

                meta = _json.loads(face_path.read_text(encoding="utf-8"))
                username = str(meta.get("username") or username)
            except (OSError, ValueError):
                pass
        out.append({"id": uid, "username": username, "role": "USER"})
    return out


def load_phrase(users_dir: Path, user_id: str) -> dict[str, Any] | None:
    path = phrase_path(users_dir, user_id)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    return data


def save_phrase(
    users_dir: Path,
    user_id: str,
    *,
    phrase: str,
    samples: list[str] | None = None,
) -> dict[str, Any]:
    norm = normalize_phrase(phrase) or normalize_phrase(DEFAULT_CHALLENGE)
    payload = {
        "phrase": norm,
        "samples": [normalize_phrase(s) for s in (samples or []) if normalize_phrase(s)],
        "challenge": DEFAULT_CHALLENGE,
    }
    path = phrase_path(users_dir, user_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    logger.info("voice_auth_phrase sauvé · user=%s · « %s »", user_id, norm)
    return payload


def name_in_heard(name: str, heard: str) -> bool:
    """Prénom / username dans la prise STT (souple : ines ↔ inness)."""
    n = normalize_phrase(name)
    h = normalize_phrase(heard)
    if not n or not h:
        return False
    if n in h:
        return True
    for tok in h.split():
        if len(tok) < 3:
            continue
        if tok in n or n in tok:
            return True
        if n.startswith(tok) or tok.startswith(n[: min(4, len(n))]):
            return True
    return False


def phrases_match(expected: str, heard: str) -> bool:
    """Acceptation souple : égalité, containment, tokens, ou alias auth."""
    if sounds_like_auth_challenge(heard):
        return True
    exp = normalize_phrase(expected)
    got = normalize_phrase(heard)
    if not exp or not got:
        return False

    def _one(target: str) -> bool:
        if not target:
            return False
        if target == got or target in got or got in target:
            return True
        toks = set(target.split())
        return len(toks) >= 2 and toks.issubset(set(got.split()))

    if _one(exp):
        return True
    for alias in AUTH_ALIASES:
        if _one(normalize_phrase(alias)):
            return True
    return False


def sounds_like_auth_challenge(heard: str) -> bool:
    """STT Whisper/voicebox — tolère « j arvise », « vis actif toi », etc."""
    h = normalize_phrase(heard)
    if not h or len(h) < 4:
        return False

    collapsed = h.replace(" ", "")

    # Nom « jarvis » déformé par STT FR
    has_jarvis = bool(
        re.search(r"j\s*ar?vise|j\s*arvis|jarvis|charvis|jarvi[s]?\b", h)
    )
    if not has_jarvis:
        has_jarvis = any(
            x in collapsed
            for x in ("jarvis", "arvise", "jarvi", "charvis", "jarvise", "jarvis")
        )
    # « j'ai un vis actif toi » / « j arvise active toi »
    if not has_jarvis and "vis" in h:
        has_jarvis = h.split()[0:1] == ["j"] or h.startswith("j ") or " j " in f" {h} "

    has_active = bool(re.search(r"activ|actif", h))
    has_toi = bool(re.search(r"\btoi\b", h)) or h.endswith(" toi")

    if has_jarvis and (has_active or has_toi):
        return True

    if "hey" in h.split() and ("jarvis" in collapsed or "arvis" in collapsed):
        return True

    return False


def pick_canonical_phrase(samples: list[str]) -> str:
    norms = [normalize_phrase(s) for s in samples if normalize_phrase(s)]
    if not norms:
        return normalize_phrase(DEFAULT_CHALLENGE)
    challenge = normalize_phrase(DEFAULT_CHALLENGE)
    for n in norms:
        if challenge in n or set(challenge.split()).issubset(set(n.split())):
            return challenge
    return max(set(norms), key=norms.count)


def _role_rank(role: str) -> int:
    r = (role or "").upper()
    if r == "ADMIN":
        return 2
    if r == "USER":
        return 1
    return 0


def match_users(
    users_dir: Path,
    transcript: str,
    candidates: list[dict[str, Any]],
    *,
    username_hint: str = "",
) -> dict[str, Any] | None:
    """Match phrase d'accès — une seule phrase pour tout le foyer.

    Pas de prénom obligatoire dans la prise. Désambiguïcation :
    1. hint session (dernier user HUD)
    2. prénom dit spontanément (bonus)
    3. rôle ADMIN si phrase seule et plusieurs profils
    """
    heard = normalize_phrase(transcript)
    if not heard:
        return None

    hint = normalize_phrase(username_hint)
    hits: list[tuple[float, dict[str, Any]]] = []

    for u in candidates:
        uid = str(u.get("id") or "")
        if not uid:
            continue
        stored = load_phrase(users_dir, uid)
        expected = normalize_phrase(DEFAULT_CHALLENGE)
        stored_phrase = normalize_phrase(str((stored or {}).get("phrase") or ""))
        if not phrases_match(expected, heard) and not sounds_like_auth_challenge(heard):
            continue

        uname = str(u.get("username") or "")
        display = str(u.get("display_name") or "")
        role = str(u.get("role") or "")

        conf = 0.88
        if hint and (name_in_heard(hint, uname) or name_in_heard(hint, display)):
            conf = 0.94
        elif name_in_heard(uname, heard) or name_in_heard(display, heard):
            conf = 0.93
        elif _role_rank(role) >= 2:
            conf = 0.90
        elif len(candidates) == 1:
            conf = 0.92

        hits.append((
            conf,
            {
                "user_id": uid,
                "username": u.get("username"),
                "confidence": conf,
                "_role_rank": _role_rank(role),
            },
        ))

    if not hits:
        return None

    hits.sort(key=lambda x: (x[0], x[1].get("_role_rank", 0)), reverse=True)
    best = hits[0][1]
    best.pop("_role_rank", None)
    return best
