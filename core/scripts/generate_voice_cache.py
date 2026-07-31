"""Génération du cache vocal JARVIS depuis `core/dialogues/*.yaml`.

Les YAML de dialogues sont la **banque vocale officielle** : ils portent le
texte mais aussi `event`, `address`, `user_role`, `orb_state`, `pause_ms`.
Ce script les lit, expanse les placeholders, applique le dictionnaire de
prononciation, appelle ElevenLabs et pose des WAV sur le disque du NUC.

Nommage par **hash de contenu**, pas par numéro de séquence : modifier une
phrase sur cinq cents n'en régénère qu'une seule. Sur un cache qu'on retouche
vingt fois, c'est ce qui rend l'itération supportable.

À l'exécution, le Core ne rappelle jamais ElevenLabs : il lit `manifest.json`,
filtre par `event` / `address` / `user_role`, tire une variante au hasard et
joue le fichier.

Usage :
    python -m scripts.generate_voice_cache              # simulation (défaut)
    python -m scripts.generate_voice_cache --apply      # génère réellement
    python -m scripts.generate_voice_cache --apply --only quotidien
"""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import logging
import os
import re
import sys
import wave
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from urllib import error, request

import yaml

logger = logging.getLogger("jarvis.voice.cache")

REPO_ROOT = Path(__file__).resolve().parents[2]
DIALOGUES_DIR = REPO_ROOT / "core" / "dialogues"
VOICE_DIR = REPO_ROOT / "core" / "data" / "voice"
CONFIG_PATH = VOICE_DIR / "cache_config.yaml"
PRONUNCIATION_PATH = VOICE_DIR / "prononciation.yaml"
ENV_PATH = REPO_ROOT / "core" / ".env"

API_BASE = "https://api.elevenlabs.io/v1/text-to-speech"
API_TIMEOUT = 120.0

PLACEHOLDER_RE = re.compile(r"\{(\w+)\}")

# pcm_24000 renvoie du PCM brut sans en-tête : on l'emballe nous-mêmes.
PCM_FORMATS = {
    "pcm_16000": 16000,
    "pcm_22050": 22050,
    "pcm_24000": 24000,
    "pcm_44100": 44100,
}


@dataclass(frozen=True)
class Clip:
    """Un WAV à générer — une variante, avec ses placeholders résolus."""

    domain: str
    event: str
    text: str  # texte affiché (orthographe réelle)
    text_tts: str  # texte envoyé au TTS (alias de prononciation appliqués)
    address: str | None
    user_role: str | None
    tone: str | None
    orb_state: str | None
    pause_ms: int | None
    bindings: dict[str, str] = field(default_factory=dict)

    def digest(self, voice_id: str, model_id: str, settings_key: str) -> str:
        """Hash stable du contenu **audio** — pas des métadonnées.

        Changer `orb_state` ne doit pas provoquer une régénération : seul ce
        qui influence le son entre dans le hash.
        """
        payload = "\x1f".join([self.text_tts, voice_id, model_id, settings_key])
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def read_api_key() -> str | None:
    """Clé depuis l'environnement, sinon depuis `core/.env`.

    `.env` est déjà couvert par le `.gitignore` du dépôt — la clé ne peut pas
    partir dans un commit par inadvertance.
    """
    key = os.environ.get("ELEVENLABS_API_KEY")
    if key:
        return key.strip()
    if not ENV_PATH.exists():
        return None
    for raw in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line.startswith("ELEVENLABS_API_KEY="):
            return line.split("=", 1)[1].strip().strip("\"'") or None
    return None


def load_pronunciation() -> list[tuple[str, str]]:
    """Alias de prononciation, du plus long au plus court.

    Le tri évite qu'un alias court n'ampute un mot plus long qui le contient.
    """
    if not PRONUNCIATION_PATH.exists():
        logger.warning("Aucun dictionnaire de prononciation (%s)", PRONUNCIATION_PATH)
        return []
    raw = load_yaml(PRONUNCIATION_PATH).get("aliases") or []
    pairs = [(e["mot"], e["alias"]) for e in raw if e.get("mot") and e.get("alias")]
    return sorted(pairs, key=lambda p: len(p[0]), reverse=True)


def apply_pronunciation(text: str, aliases: list[tuple[str, str]]) -> str:
    """Substitue les alias — sur le texte envoyé au TTS uniquement.

    Le HUD continue d'afficher l'orthographe réelle : l'utilisateur ne voit
    jamais « Inèsse ».
    """
    out = text
    for mot, alias in aliases:
        out = re.sub(rf"\b{re.escape(mot)}\b", alias, out)
    return out


def expand(text: str, placeholders: dict[str, list[str]]) -> Iterator[tuple[str, dict[str, str]]]:
    """Produit une phrase entière par combinaison de placeholders.

    On génère la phrase complète plutôt que d'assembler des fragments : une
    salutation recollée devant un prénom porte l'intonation descendante de
    fin de phrase et s'entend immédiatement. Les ensembles sont petits et
    fermés (5 prénoms, 6 pièces), le coût en fichiers est négligeable.
    """
    keys = sorted(set(PLACEHOLDER_RE.findall(text)))
    if not keys:
        yield text, {}
        return

    unknown = [k for k in keys if k not in placeholders]
    if unknown:
        logger.warning("Placeholder(s) sans valeurs %s dans : %s", unknown, text)
        return

    for combo in itertools.product(*(placeholders[k] for k in keys)):
        bindings = dict(zip(keys, combo))
        rendered = text
        for key, value in bindings.items():
            rendered = rendered.replace("{" + key + "}", value)
        yield rendered, bindings


def scoped_placeholders(
    placeholders: dict[str, list[str]],
    user_roles: dict[str, str],
    user_role: str | None,
    role_titles: dict[str, str] | None = None,
) -> dict[str, list[str]]:
    """Restreint `{user}` et `{titre}` au rôle porté par la ligne.

    Sans ça, une ligne « Dix minutes, {user}. Tu as le temps de finir. »
    marquée `user_role: child` produit aussi « Dix minutes, Samir. » — absurde,
    et facturé. C'est exactement ce qui s'est produit sur le domaine `ecrans`.

    Même logique pour le titre : « Pas ce soir, monsieur » adressé à Syrine
    n'a aucun sens. `role_titles` mappe admin → monsieur, user → madame,
    child → mademoiselle.
    """
    if not user_role:
        return placeholders

    scoped = dict(placeholders)

    if user_roles:
        names = [n for n in placeholders.get("user", []) if user_roles.get(n) == user_role]
        if names:
            scoped["user"] = names

    if role_titles and (titre := role_titles.get(user_role)):
        scoped["titre"] = [titre]

    return scoped


def collect_clips(
    placeholders: dict[str, list[str]],
    aliases: list[tuple[str, str]],
    only: str | None = None,
    user_roles: dict[str, str] | None = None,
    role_titles: dict[str, str] | None = None,
) -> list[Clip]:
    """Aplatit tous les YAML de dialogues en clips à générer."""
    clips: list[Clip] = []
    seen: set[str] = set()
    user_roles = user_roles or {}

    for path in sorted(DIALOGUES_DIR.glob("*.yaml")):
        data = load_yaml(path)
        domain = data.get("domain") or path.stem
        if only and domain != only:
            continue

        for line in data.get("lines") or []:
            texts = line.get("text")
            if isinstance(texts, str):
                texts = [texts]
            if not texts:
                continue

            scope = scoped_placeholders(
                placeholders, user_roles, line.get("user_role"), role_titles
            )

            for template in texts:
                for rendered, bindings in expand(template, scope):
                    text_tts = apply_pronunciation(rendered, aliases)
                    # Dédoublonnage : la même phrase apparaît dans plusieurs
                    # événements (« Terminé. »). Un seul WAV, référencé
                    # plusieurs fois dans le manifeste.
                    key = f"{domain}\x1f{line.get('event')}\x1f{text_tts}"
                    if key in seen:
                        continue
                    seen.add(key)

                    clips.append(
                        Clip(
                            domain=domain,
                            event=line.get("event", "unknown"),
                            text=rendered,
                            text_tts=text_tts,
                            address=line.get("address"),
                            user_role=line.get("user_role"),
                            tone=line.get("tone"),
                            orb_state=line.get("orb_state"),
                            pause_ms=line.get("pause_ms"),
                            bindings=bindings,
                        )
                    )
    return clips


def number_fragments(cfg: dict[str, Any], aliases: list[tuple[str, str]]) -> list[Clip]:
    """Fragments numériques — le seul cas où l'assemblage est justifié.

    24 × 60 combinaisons horaires ne s'énumèrent pas en phrases entières. Un
    nombre court inséré dans une phrase fixe supporte la couture ; une phrase
    entière assemblée par morceaux, non.
    """
    frag = cfg.get("number_fragments") or {}
    if not frag.get("enabled"):
        return []

    lo, hi = frag.get("range", [0, 59])
    return [
        Clip(
            domain="fragments",
            event="number",
            text=str(n),
            text_tts=apply_pronunciation(str(n), aliases),
            address=None,
            user_role=None,
            tone="technical",
            orb_state=None,
            pause_ms=None,
            bindings={"value": str(n)},
        )
        for n in range(lo, hi + 1)
    ]


def settings_key(settings: dict[str, Any]) -> str:
    """Empreinte des réglages de voix — entre dans le hash du clip."""
    return json.dumps(settings, sort_keys=True, separators=(",", ":"))


def synthesize(
    text: str, voice_id: str, model_id: str, output_format: str, settings: dict[str, Any], api_key: str
) -> bytes:
    """Appelle ElevenLabs et renvoie le PCM brut."""
    url = f"{API_BASE}/{voice_id}?output_format={output_format}"
    body = json.dumps(
        {"text": text, "model_id": model_id, "voice_settings": settings}
    ).encode("utf-8")

    req = request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/basic",
        },
    )
    with request.urlopen(req, timeout=API_TIMEOUT) as resp:
        return resp.read()


# ─── Contrôle de voix ─────────────────────────────────────────────────────
#
# ElevenLabs produit de temps en temps une génération HORS VOIX : même
# `voice_id`, même modèle, mais le timbre part ailleurs — typiquement vers une
# voix féminine. Ça touche un clip isolé au milieu d'un lot correct.
#
# Rien dans la chaîne ne le détectait : le nom du fichier est un hash du TEXTE,
# pas de l'audio. Un clip dérivé s'installait donc dans le cache et n'en
# ressortait qu'à l'oreille, des semaines plus tard — sur 748 clips, autant
# dire jamais. Un audit a fini par en trouver quinze d'un coup.
#
# On mesure donc la hauteur de voix juste après la synthèse, et on relance si
# elle sort de la bande. Coût : une poignée d'appels supplémentaires sur un
# cache qu'on ne génère qu'une fois.

#: Bande admissible pour la voix JARVIS, en Hz. La médiane mesurée sur le
#: cache est de 118 Hz ; les dérives observées tombaient toutes au-dessus de
#: 190 Hz. 165 Hz laisse largement respirer l'intonation normale sans laisser
#: passer un changement de timbre.
F0_MIN_ATTENDU = 80.0
F0_MAX_ATTENDU = 165.0

#: Nombre de reprises avant d'abandonner. Trois suffisent : la dérive est
#: aléatoire, et la voir se répéter trois fois signale un texte problématique
#: (français mal formé, fragment d'une syllabe) — pas un aléa de génération.
RETRIES_VOIX = 3


def _f0_mediane(pcm: bytes, sample_rate: int) -> float | None:
    """Fondamental médian du PCM, par autocorrélation sur les trames voisées.

    Volontairement autonome (numpy seul) : ce script tourne avant que quoi que
    ce soit d'autre existe, et ne doit dépendre d'aucun module du Core.
    """
    import numpy as np

    signal = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    taille = int(0.040 * sample_rate)
    saut = int(0.020 * sample_rate)
    lag_min = int(sample_rate / 400.0)
    lag_max = int(sample_rate / 60.0)
    if len(signal) < taille or lag_max >= taille:
        return None

    valeurs: list[float] = []
    for debut in range(0, len(signal) - taille, saut):
        trame = signal[debut : debut + taille]
        if float(np.sqrt(np.mean(trame**2))) < 0.01:
            continue  # silence
        trame = trame - trame.mean()
        corr = np.correlate(trame, trame, mode="full")[taille - 1 :]
        if corr[0] <= 0:
            continue
        segment = (corr / corr[0])[lag_min:lag_max]
        if segment.size == 0:
            continue
        pic = int(np.argmax(segment))
        if segment[pic] < 0.30:
            continue  # non voisé
        valeurs.append(sample_rate / (lag_min + pic))

    # Trop peu de trames voisées : clip d'une syllabe. On ne juge pas — mieux
    # vaut laisser passer que de relancer indéfiniment sur « 7 ».
    if len(valeurs) < 10:
        return None
    return float(sorted(valeurs)[len(valeurs) // 2])


def voix_conforme(pcm: bytes, sample_rate: int) -> tuple[bool, float | None]:
    f0 = _f0_mediane(pcm, sample_rate)
    if f0 is None:
        return True, None
    return F0_MIN_ATTENDU <= f0 <= F0_MAX_ATTENDU, f0


def write_wav(path: Path, pcm: bytes, sample_rate: int) -> None:
    """Emballe le PCM brut dans un vrai conteneur WAV (mono 16 bits)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)


def write_index(out_dir: Path, entries: list[dict[str, Any]], voice_id: str, model_id: str) -> None:
    """INDEX.md — table réplique → fichier, lisible par un humain.

    `manifest.json` est fait pour le Core ; les noms de fichiers sont des
    hash. Sans cette table, retrouver le WAV d'une réplique demande de lire
    du JSON à la main.
    """
    md = [
        f"# Index du cache vocal — `{voice_id}`",
        "",
        f"{len(entries)} clips · modèle `{model_id}` · "
        f"généré le {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M')} UTC",
        "",
        "Le Core, lui, lit `manifest.json` : il filtre par `event` / `address` /",
        "`user_role`, tire une variante au hasard et joue le fichier.",
        "",
    ]
    by_domain: dict[str, list[dict[str, Any]]] = {}
    for e in entries:
        by_domain.setdefault(e["domain"], []).append(e)

    for domain in sorted(by_domain):
        items = by_domain[domain]
        md += [f"## {domain} — {len(items)} clips", ""]
        current = None
        for e in sorted(items, key=lambda x: (x["event"], x["text"])):
            if e["event"] != current:
                current = e["event"]
                tags = [t for t in (e.get("address"), e.get("user_role")) if t]
                suffix = f"  ·  _{' · '.join(tags)}_" if tags else ""
                md += ["", f"### `{current}`{suffix}", ""]
            md.append(f"- « {e['text']} » → `{Path(e['file']).name}`")
        md.append("")

    (out_dir / "INDEX.md").write_text("\n".join(md), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Génère le cache vocal JARVIS.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Génère réellement. Sans ce drapeau : simulation, aucun appel facturé.",
    )
    parser.add_argument("--only", help="Limiter à un domaine (quotidien, session…).")
    parser.add_argument(
        "--limit",
        type=int,
        help="N'en générer que N. Sert au lot d'essai : valider la voix et les "
        "réglages pour quelques centaines de caractères avant la passe complète.",
    )
    parser.add_argument("--force", action="store_true", help="Régénérer même si le WAV existe.")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    cfg = load_yaml(CONFIG_PATH)
    el = cfg.get("elevenlabs") or {}
    voice_id = el.get("voice_id")
    model_id = el.get("model_id")
    output_format = el.get("output_format", "pcm_24000")
    settings = el.get("voice_settings") or {}

    if not voice_id or not model_id:
        logger.error("voice_id / model_id manquants dans %s", CONFIG_PATH)
        return 1

    sample_rate = PCM_FORMATS.get(output_format)
    if sample_rate is None:
        logger.error("output_format non PCM (%s) — attendu : %s", output_format, ", ".join(PCM_FORMATS))
        return 1

    # Un dossier par voix : le voice_id détermine déjà le CONTENU des fichiers
    # (il entre dans le hash), autant qu'il détermine aussi leur EMPLACEMENT.
    # Deux voix ne se mélangent plus, et revenir en arrière ne coûte rien —
    # les fichiers de l'ancienne sont restés rangés dans son dossier.
    # Dossier lisible (`voice_name`) plutôt que le voice_id brut. Le hash,
    # lui, reste calé sur le voice_id : renommer ne régénère rien.
    folder = el.get("voice_name") or voice_id
    out_dir = REPO_ROOT / cfg.get("output_dir", "core/data/voice/cache") / folder
    aliases = load_pronunciation()
    placeholders = cfg.get("placeholders") or {}

    # `--only` filtre ce qu'on GÉNÈRE, jamais ce que le manifeste couvre : un
    # manifeste réécrit avec un seul domaine rendrait tout le reste du cache
    # invisible au Core, alors que les WAV sont bien sur le disque.
    all_clips = collect_clips(
        placeholders,
        aliases,
        user_roles=cfg.get("user_roles") or {},
        role_titles=cfg.get("role_titles") or {},
    )
    clips = [c for c in all_clips if not args.only or c.domain == args.only]
    fragments = number_fragments(cfg, aliases)
    all_clips += fragments
    clips += [c for c in fragments if not args.only or c.domain == args.only]

    skey = settings_key(settings)
    entries: list[dict[str, Any]] = []
    to_generate: list[tuple[Clip, Path]] = []

    for clip in all_clips:
        digest = clip.digest(voice_id, model_id, skey)
        rel = Path(clip.domain) / f"{digest}.wav"
        if clip in clips and (args.force or not (out_dir / rel).exists()):
            to_generate.append((clip, out_dir / rel))
        entries.append(
            {
                "domain": clip.domain,
                "event": clip.event,
                "address": clip.address,
                "user_role": clip.user_role,
                "tone": clip.tone,
                "orb_state": clip.orb_state,
                "pause_ms": clip.pause_ms,
                "bindings": clip.bindings or None,
                "text": clip.text,
                "file": rel.as_posix(),
            }
        )

    if args.limit is not None:
        to_generate = to_generate[: args.limit]

    # Le hash dédoublonne : deux événements partageant « Terminé. » pointent
    # sur le même WAV. On ne facture pas deux fois la même phrase.
    unique_new = {p for _, p in to_generate}
    chars = sum(len(c.text_tts) for c, p in to_generate if p in unique_new)

    logger.info("Clips référencés     : %d", len(entries))
    logger.info("WAV uniques à créer  : %d", len(unique_new))
    logger.info("Caractères facturés  : %d", chars)

    if not args.apply:
        logger.info("\nSimulation — aucun appel émis. Relancer avec --apply pour générer.")
        return 0

    api_key = read_api_key()
    if not api_key:
        logger.error(
            "ELEVENLABS_API_KEY introuvable.\n"
            "Ajouter la ligne suivante dans %s (fichier déjà ignoré par git) :\n"
            "    ELEVENLABS_API_KEY=sk_...",
            ENV_PATH,
        )
        return 1

    done: set[Path] = set()
    failures = 0
    for index, (clip, path) in enumerate(to_generate, start=1):
        if path in done:
            continue
        try:
            pcm = None
            for essai in range(1, RETRIES_VOIX + 1):
                candidat = synthesize(
                    clip.text_tts, voice_id, model_id, output_format, settings, api_key
                )
                ok, f0 = voix_conforme(candidat, sample_rate)
                if ok:
                    pcm = candidat
                    break
                logger.warning(
                    "  voix hors bande (%.0f Hz) sur « %s » — reprise %d/%d",
                    f0 or 0.0, clip.text, essai, RETRIES_VOIX,
                )
                pcm = candidat  # on garde la dernière, faute de mieux
            if pcm is None:  # pragma: no cover — synthesize aurait levé
                raise RuntimeError("aucune synthèse produite")
            # Après RETRIES_VOIX échecs, c'est le TEXTE qui pose problème, pas
            # la génération : français mal formé par expansion de placeholder,
            # ou fragment trop court. On écrit quand même — un clip imparfait
            # vaut mieux qu'un trou — mais on le dit fort.
            ok, f0 = voix_conforme(pcm, sample_rate)
            if not ok:
                failures += 1
                logger.error(
                    "  VOIX NON CONFORME (%.0f Hz) conservée pour « %s » — "
                    "vérifier la formulation du texte",
                    f0 or 0.0, clip.text,
                )
            write_wav(path, pcm, sample_rate)
            done.add(path)
            logger.info("[%d/%d] %s — « %s »", index, len(to_generate), path.name, clip.text)
        except error.HTTPError as exc:
            failures += 1
            logger.error("Échec (%s) sur « %s » : %s", exc.code, clip.text, exc.read()[:200])
        except Exception as exc:  # noqa: BLE001
            failures += 1
            logger.error("Échec sur « %s » : %s", clip.text, exc)

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "voice_id": voice_id,
        "model_id": model_id,
        "output_format": output_format,
        "voice_settings": settings,
        "entries": entries,
    }
    manifest_path = out_dir / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    write_index(out_dir, entries, folder, model_id)

    logger.info("\nManifeste : %s", manifest_path)
    if failures:
        logger.error("%d échec(s) — relancer le script, les WAV existants sont conservés.", failures)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
