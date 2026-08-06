"""Reconstruit `manifest.json` d'un pack vocal à partir des WAV déjà sur le disque.

Pourquoi ce script existe : le pack `jarvis` (voix d'origine) a ses 679 WAV mais
plus son manifeste. Or `VoiceCache` ne lit QUE le manifeste — sans lui, un pack
complet est invisible et JARVIS reste muet. Revenir à une ancienne voix
demandait donc de tout resynthétiser, c'est-à-dire de repayer un cache qu'on
possède déjà.

Le nom de chaque fichier étant `sha256(texte + voice_id + model_id + réglages)`,
la correspondance phrase → fichier est **recalculable**. On rejoue donc la même
expansion que le générateur, on recalcule les empreintes avec le `voice_id`
visé, et on n'inscrit au manifeste que ce qui existe réellement.

⚠ On n'inscrit JAMAIS une entrée dont le WAV est absent : le Core y verrait une
phrase disponible et servirait un fichier introuvable. Une entrée manquante
retombe proprement sur la synthèse ; une entrée mensongère casse la lecture.

    python scripts/rebuild_voice_manifest.py --voice-id F42eFqrXBZYrTDYwcHo0 --folder jarvis
    python scripts/rebuild_voice_manifest.py ... --report manquants.txt
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CORE = REPO_ROOT / "core"


def _load_generator():
    """Importe le générateur sans l'exécuter.

    Un `import` classique échoue : le module n'est pas dans un paquet et ses
    dataclasses résolvent leurs annotations via `sys.modules`. On le charge
    donc explicitement et on l'enregistre avant exécution.
    """
    path = CORE / "scripts" / "generate_voice_cache.py"
    spec = importlib.util.spec_from_file_location("generate_voice_cache", path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"générateur introuvable : {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["generate_voice_cache"] = module
    spec.loader.exec_module(module)
    return module


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--voice-id", required=True, help="voice_id ayant servi à générer le pack")
    ap.add_argument("--folder", required=True, help="dossier du pack sous data/voice/cache")
    ap.add_argument("--report", help="fichier où lister les phrases sans WAV")
    ap.add_argument(
        "--dry-run", action="store_true", help="mesure la couverture sans rien écrire"
    )
    args = ap.parse_args()

    g = _load_generator()

    cfg = g.load_yaml(CORE / "data" / "voice" / "cache_config.yaml")
    el = cfg["elevenlabs"]
    model_id = el["model_id"]
    settings = el.get("voice_settings") or {}
    skey = g.settings_key(settings)

    # Mêmes entrées que le générateur : la liste des phrases vient des
    # dialogues, pas du pack. Les deux voix disent exactement les mêmes choses.
    aliases = g.load_pronunciation()
    placeholders = cfg.get("placeholders") or {}
    clips = g.collect_clips(
        placeholders,
        aliases,
        user_roles=cfg.get("user_roles") or {},
        role_titles=cfg.get("role_titles") or {},
    )
    clips += g.number_fragments(cfg, aliases)

    out_dir = CORE / "data" / "voice" / "cache" / args.folder
    if not out_dir.is_dir():
        raise SystemExit(f"pack introuvable : {out_dir}")

    entries: list[dict] = []
    missing: list[tuple[str, str]] = []
    for clip in clips:
        rel = Path(clip.domain) / f"{clip.digest(args.voice_id, model_id, skey)}.wav"
        if not (out_dir / rel).exists():
            missing.append((clip.event, clip.text))
            continue
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

    total = len(clips)
    print(f"pack       : {out_dir}")
    print(f"voice_id   : {args.voice_id}")
    print(f"attendues  : {total}")
    print(f"presentes  : {len(entries)}")
    print(f"manquantes : {len(missing)}")

    if missing:
        # Par événement : savoir QUE 160 phrases manquent n'aide pas ; savoir
        # que c'est tout le domaine « recovery » dit quoi regénérer.
        top = Counter(ev for ev, _ in missing).most_common(12)
        print("\névénements sans audio (12 premiers) :")
        for ev, n in top:
            print(f"  {n:3d}  {ev}")

    if args.report and missing:
        Path(args.report).write_text(
            "\n".join(f"{ev}\t{txt}" for ev, txt in missing), encoding="utf-8"
        )
        print(f"\nliste complète : {args.report}")

    if args.dry_run:
        print("\n--dry-run : manifeste NON écrit")
        return 0

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "voice_id": args.voice_id,
        "model_id": model_id,
        "output_format": el.get("output_format"),
        "voice_settings": settings,
        # Trace du procédé : ce manifeste n'est pas sorti d'une génération.
        "rebuilt_from_disk": True,
        "entries": entries,
    }
    path = out_dir / "manifest.json"
    if path.exists():
        backup = out_dir / "manifest.json.bak"
        backup.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"\nancien manifeste sauvegardé : {backup}")
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"manifeste écrit : {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
