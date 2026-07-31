"""Détecte les clips du cache dont la VOIX a dérivé.

ElevenLabs produit de temps en temps une génération hors-voix : même `voice_id`,
même modèle, mais le timbre part ailleurs — typiquement vers une voix féminine.
Ça touche un clip isolé, pas un lot, et rien dans la chaîne ne le détecte : le
nom du fichier est un hash du TEXTE, pas de l'audio.

Sur sept cents clips, repérer ça à l'oreille n'est pas une méthode. On mesure
donc la fréquence fondamentale (F0) de chaque clip et on sort les intrus.

    voix masculine   ~85–155 Hz
    voix féminine   ~165–255 Hz

La détection se fait par autocorrélation sur les trames voisées, et on retient
la MÉDIANE des trames — robuste aux consonnes et aux silences, là où une moyenne
se ferait tirer par n'importe quel claquement.

Le seuil n'est pas absolu : on compare chaque clip à la médiane du cache. Une
voix de synthèse est très stable, donc un écart franc est forcément anormal.

    python scripts/audit_cache_voix.py                # rapport
    python scripts/audit_cache_voix.py --purger       # supprime les intrus
                                                      # (puis relancer la génération)
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import wave
from pathlib import Path

import numpy as np
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
VOICE_DIR = REPO_ROOT / "core" / "data" / "voice"
CACHE_ROOT = VOICE_DIR / "cache"

# Bornes de recherche du fondamental. Large exprès : on veut VOIR la dérive,
# pas la faire rentrer de force dans une plage masculine.
F0_MIN_HZ = 60.0
F0_MAX_HZ = 400.0

#: Écart au-delà duquel un clip est signalé, en demi-tons par rapport à la
#: médiane du cache. Une octave = 12.
#:
#: Calé sur une mesure réelle du cache, pas au jugé. À 4 demi-tons, l'audit
#: sortait 26 clips en deux paquets distincts : quinze entre +8,4 et +10,6
#: (timbre franchement autre), et onze autour de ±4,5 qui étaient tous des
#: fragments d'une syllabe — « 4 », « 7 », « Bonsoir. » Sur un mot aussi
#: court, l'intonation montante ou descendante emporte la médiane et n'a
#: rien à voir avec le timbre. 7 tombe dans le vide entre les deux paquets.
ECART_DEMI_TONS = 7.0

#: En dessous, la trame n'est pas voisée (silence, consonne sourde) : son F0
#: n'a aucun sens et fausserait la médiane.
SEUIL_VOISEMENT = 0.30


def cache_dir() -> Path:
    cfg = yaml.safe_load((VOICE_DIR / "cache_config.yaml").read_text(encoding="utf-8")) or {}
    name = (cfg.get("elevenlabs") or {}).get("voice_name")
    if name and (CACHE_ROOT / name).is_dir():
        return CACHE_ROOT / name
    raise SystemExit("voice_name introuvable dans cache_config.yaml")


def lire_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as w:
        sr = w.getframerate()
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0, sr


def f0_median(signal: np.ndarray, sr: int) -> float | None:
    """F0 médiane des trames voisées, par autocorrélation.

    Trames de 40 ms : assez longues pour contenir plusieurs périodes même à
    60 Hz, assez courtes pour que la hauteur y soit stable.
    """
    taille = int(0.040 * sr)
    saut = int(0.020 * sr)
    lag_min = int(sr / F0_MAX_HZ)
    lag_max = int(sr / F0_MIN_HZ)
    if len(signal) < taille or lag_max >= taille:
        return None

    valeurs: list[float] = []
    for debut in range(0, len(signal) - taille, saut):
        trame = signal[debut : debut + taille]
        energie = float(np.sqrt(np.mean(trame**2)))
        if energie < 0.01:  # silence
            continue
        trame = trame - trame.mean()
        corr = np.correlate(trame, trame, mode="full")[taille - 1 :]
        if corr[0] <= 0:
            continue
        corr = corr / corr[0]
        segment = corr[lag_min:lag_max]
        if segment.size == 0:
            continue
        pic = int(np.argmax(segment))
        if segment[pic] < SEUIL_VOISEMENT:
            continue
        valeurs.append(sr / (lag_min + pic))

    # Moins de dix trames voisées : clip trop court ou trop bruité pour juger.
    # Mieux vaut ne rien dire que de signaler à tort.
    if len(valeurs) < 10:
        return None
    return float(statistics.median(valeurs))


def demi_tons(f0: float, ref: float) -> float:
    return 12.0 * float(np.log2(f0 / ref))


def main() -> int:
    parser = argparse.ArgumentParser(description="Audite la voix du cache vocal.")
    parser.add_argument("--purger", action="store_true",
                        help="Supprime les clips signalés pour forcer leur regénération.")
    parser.add_argument("--domaine", help="Limiter à un domaine.")
    args = parser.parse_args()

    racine = cache_dir()
    entries = json.loads((racine / "manifest.json").read_text(encoding="utf-8"))["entries"]
    if args.domaine:
        entries = [e for e in entries if e["domain"] == args.domaine]

    mesures: list[tuple[float, dict]] = []
    ignores = 0
    for e in entries:
        chemin = racine / e["file"]
        if not chemin.exists():
            continue
        try:
            signal, sr = lire_wav(chemin)
            f0 = f0_median(signal, sr)
        except Exception:  # noqa: BLE001 — un WAV illisible n'arrête pas l'audit
            f0 = None
        if f0 is None:
            ignores += 1
            continue
        mesures.append((f0, e))

    if not mesures:
        print("Aucun clip mesurable.")
        return 1

    reference = statistics.median(f0 for f0, _ in mesures)
    print(f"{len(mesures)} clips mesurés · {ignores} trop courts pour juger")
    print(f"F0 médiane du cache : {reference:.0f} Hz\n")

    suspects = [
        (f0, e) for f0, e in mesures if abs(demi_tons(f0, reference)) >= ECART_DEMI_TONS
    ]
    if not suspects:
        print("Aucune dérive détectée — le cache est homogène.")
        return 0

    print(f"{len(suspects)} clip(s) hors voix :\n")
    for f0, e in sorted(suspects, key=lambda x: -x[0]):
        ecart = demi_tons(f0, reference)
        print(f"  {f0:6.0f} Hz  ({ecart:+5.1f} demi-tons)  {e['domain']:12} "
              f"{e['event']:24} « {e['text']} »")
        print(f"          {e['file']}")

    if args.purger:
        for _, e in suspects:
            (racine / e["file"]).unlink(missing_ok=True)
        print(f"\n{len(suspects)} fichier(s) supprimé(s).")
        print("Relancer : python -m scripts.generate_voice_cache --apply")
    else:
        print("\n--purger pour les supprimer, puis relancer la génération.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
