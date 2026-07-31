"""Test du wake word, boucle complète : détection → son → voix.

Dis « hey jarvis » : le détecteur publie, le son de réveil part, puis un clip
d'accusé tiré du cache. C'est la séquence réelle de `data/hud/orbe.yaml`,
jouée ici en ligne de commande plutôt que dans le HUD.

    python scripts/test_wake.py            # Samir, vouvoiement
    python scripts/test_wake.py --user Inès --address tu
    python scripts/test_wake.py --seconds 60
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import platform
import random
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from jarvis_core.voice import WakeWordDetector  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "core" / "data" / "voice" / "cache"
SFX = ROOT / "assets" / "sfx"


def play(path: Path) -> None:
    """Lecture bloquante — on veut entendre la séquence dans l'ordre."""
    if not path.exists():
        return
    if platform.system() == "Windows":
        import winsound

        winsound.PlaySound(str(path), winsound.SND_FILENAME)
        return
    for player in ("aplay", "paplay", "afplay"):
        try:
            subprocess.run([player, str(path)], check=True, capture_output=True)
            return
        except (FileNotFoundError, subprocess.CalledProcessError):
            continue


def pick_ack(user: str, address: str) -> tuple[Path, str] | None:
    """Choisit un accusé de réveil : même filtrage que fera le Core.

    On retient les lignes `wake_ack` dont l'adresse est compatible — soit
    neutre (elle sert tout le monde), soit celle du profil.
    """
    manifest = CACHE / "manifest.json"
    if not manifest.exists():
        return None
    entries = json.loads(manifest.read_text(encoding="utf-8"))["entries"]

    candidates = [
        e
        for e in entries
        if e["event"] == "wake_ack"
        and e["address"] in (None, address)
        and (e.get("bindings") or {}).get("user", user) == user
    ]
    if not candidates:
        return None
    chosen = random.choice(candidates)
    return CACHE / chosen["file"], chosen["text"]


async def main() -> int:
    parser = argparse.ArgumentParser(description="Test du wake word.")
    parser.add_argument("--user", default="Samir")
    parser.add_argument("--address", default="vous", choices=["vous", "tu"])
    parser.add_argument("--seconds", type=int, default=45)
    parser.add_argument("--sound", default="wake_rise.wav")
    args = parser.parse_args()

    logging.basicConfig(level=logging.WARNING, format="%(message)s")

    loop = asyncio.get_running_loop()
    detector: WakeWordDetector | None = None

    def on_wake(payload: dict) -> None:
        # `silent_ack` = réveil enchaîné : l'orbe réagirait, mais JARVIS ne se
        # re-présente pas. Personne ne se fait annoncer trois fois d'affilée.
        silent = payload.get("silent_ack")
        print(f"\n  ▸ DÉTECTÉ  score={payload['score']}  silent_ack={silent}")

        play(SFX / args.sound)
        if silent:
            print("    (accusé muet — réveil récent)")
        else:
            found = pick_ack(args.user, args.address)
            if found:
                path, text = found
                print(f"    « {text} »")
                play(path)
            else:
                print("    (aucun clip wake_ack au manifeste)")
        if detector:
            detector.note_interaction()

    detector = WakeWordDetector(on_wake, loop=loop)
    if not detector.load():
        print(f"Wake word indisponible : {detector.last_error}")
        return 1
    if not detector.start():
        print(f"Micro indisponible : {detector.last_error}")
        return 1

    print(f"Écoute {args.seconds} s — dis « hey jarvis »")
    print(f"  profil : {args.user} ({args.address})  ·  seuil : {detector.threshold}")
    print("  redis-le tout de suite après pour voir l'anti-perroquet\n")

    try:
        await asyncio.sleep(args.seconds)
    finally:
        detector.stop()
        print(f"\nTerminé — {detector.detections} détection(s)")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
