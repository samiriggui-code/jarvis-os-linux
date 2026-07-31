"""Joue une séquence du cache vocal dans l'ordre, avec les pauses réelles.

Les WAV sont nommés par hash : l'ordre alphabétique n'a aucun sens. Ce script
lit `manifest.json` et rejoue les clips dans l'ordre de la bibliothèque, en
respectant les `pause_ms`. C'est la seule façon de juger une séquence — quatre
fichiers écoutés séparément ne disent rien du rythme.

Usage :
    python scripts/play_cache.py boot
    python scripts/play_cache.py quotidien --event ack_done
    python scripts/play_cache.py --list
"""

from __future__ import annotations

import argparse
import json
import platform
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
VOICE_DIR = REPO_ROOT / "core" / "data" / "voice"
CACHE_ROOT = VOICE_DIR / "cache"
CONFIG_PATH = VOICE_DIR / "cache_config.yaml"


def cache_dir() -> Path:
    """Dossier de la voix COURANTE.

    Le cache a un sous-dossier par voix (`cache/jarvis2/`) depuis qu'on peut
    en changer sans tout écraser. Ce script pointait encore sur `cache/` tout
    court : il ne trouvait plus aucun manifeste et répondait « générer
    d'abord » sur un cache de sept cents clips.

    Même source de vérité que `VoiceCache` — le nom vient de la config, pas
    d'une constante recopiée ici qui divergerait au prochain changement.
    """
    try:
        import yaml

        cfg = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
        name = (cfg.get("elevenlabs") or {}).get("voice_name")
        if name and (CACHE_ROOT / name / "manifest.json").exists():
            return CACHE_ROOT / name
    except Exception:  # noqa: BLE001 — on retombe sur la détection
        pass
    # Repli : le dossier le plus récemment écrit qui porte un manifeste.
    candidates = [d for d in CACHE_ROOT.glob("*/manifest.json")]
    if candidates:
        return max(candidates, key=lambda p: p.stat().st_mtime).parent
    return CACHE_ROOT


CACHE_DIR = cache_dir()
MANIFEST = CACHE_DIR / "manifest.json"


def play(path: Path) -> None:
    """Lecture bloquante — indispensable pour respecter le rythme."""
    system = platform.system()
    if system == "Windows":
        import winsound

        winsound.PlaySound(str(path), winsound.SND_FILENAME)
        return
    for player in ("aplay", "paplay", "afplay"):
        try:
            subprocess.run([player, str(path)], check=True, capture_output=True)
            return
        except (FileNotFoundError, subprocess.CalledProcessError):
            continue
    print(f"  (aucun lecteur audio trouvé — fichier : {path})")


def main() -> int:
    parser = argparse.ArgumentParser(description="Rejoue une séquence du cache vocal.")
    parser.add_argument("domain", nargs="?", help="boot, quotidien, enrolement, session…")
    parser.add_argument("--event", help="Limiter à un événement.")
    parser.add_argument("--list", action="store_true", help="Lister les domaines disponibles.")
    args = parser.parse_args()

    if not MANIFEST.exists():
        print(f"Aucun manifeste. Générer d'abord : {MANIFEST}")
        return 1

    entries = json.loads(MANIFEST.read_text(encoding="utf-8"))["entries"]

    if args.list or not args.domain:
        counts: dict[str, int] = {}
        for e in entries:
            counts[e["domain"]] = counts.get(e["domain"], 0) + 1
        print("Domaines dans le cache :")
        for domain, n in sorted(counts.items()):
            present = sum(
                1 for e in entries if e["domain"] == domain and (CACHE_DIR / e["file"]).exists()
            )
            print(f"  {domain:14} {present:4} / {n} générés")
        return 0

    selected = [
        e
        for e in entries
        if e["domain"] == args.domain and (not args.event or e["event"] == args.event)
    ]
    if not selected:
        print(f"Rien pour domaine={args.domain} event={args.event}")
        return 1

    missing = [e for e in selected if not (CACHE_DIR / e["file"]).exists()]
    if missing:
        print(f"{len(missing)} clip(s) pas encore généré(s) — ignorés.\n")

    for entry in selected:
        path = CACHE_DIR / entry["file"]
        if not path.exists():
            continue
        print(f"  {entry['event']:26} « {entry['text']} »")
        play(path)
        if entry.get("pause_ms"):
            time.sleep(entry["pause_ms"] / 1000)

    return 0


if __name__ == "__main__":
    sys.exit(main())
