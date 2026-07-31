"""Synthétise les sons non verbaux de l'orbe — réveil et retour au repos.

Ce ne sont PAS des clips TTS : aucun appel ElevenLabs, aucun coût. Du DSP
pur, réglable, régénérable à l'infini.

Contrainte de conception, tirée de data/hud/orbe.yaml : très court (< 250 ms)
et supportable cinquante fois par jour. Un son qu'on remarque est un son
qu'on finit par détester — celui-ci doit se faire oublier tout en confirmant
que JARVIS a entendu.

Usage :
    python scripts/make_wake_sounds.py
"""

from __future__ import annotations

import sys
import wave
from pathlib import Path

import numpy as np

RATE = 24000  # aligné sur le cache vocal
OUT = Path(__file__).resolve().parents[2] / "assets" / "sfx"


def env_attack_decay(n: int, attack: float = 0.12, curve: float = 2.2) -> np.ndarray:
    """Enveloppe douce. Une attaque franche « claque » et fatigue vite."""
    a = max(1, int(n * attack))
    env = np.concatenate([
        np.linspace(0.0, 1.0, a) ** 1.5,
        (1.0 - np.linspace(0.0, 1.0, n - a)) ** curve,
    ])
    return env[:n]


def rise(duration=0.18, f0=520.0, f1=880.0):
    """Balayage montant — « je me tourne vers toi ».

    La montée porte le sens : elle ouvre, elle n'annonce pas. C'est le
    candidat que je retiendrais.
    """
    n = int(RATE * duration)
    t = np.linspace(0, duration, n, endpoint=False)
    freq = np.linspace(f0, f1, n)
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    sig = np.sin(phase) + 0.28 * np.sin(2 * phase)  # 2e harmonique : un peu de corps
    return sig * env_attack_decay(n)


def two_tone(duration=0.16, f=660.0, ratio=1.5):
    """Deux notes brèves (quinte). Lisible, mais très « assistant vocal ».

    Efficace et immédiatement compris — au prix d'une identité générique.
    """
    n = int(RATE * duration)
    half = n // 2
    t1 = np.arange(half) / RATE
    t2 = np.arange(n - half) / RATE
    sig = np.concatenate([np.sin(2 * np.pi * f * t1), np.sin(2 * np.pi * f * ratio * t2)])
    return sig * env_attack_decay(n, attack=0.08)


def bloom(duration=0.22, f=700.0):
    """Cœur harmonique + souffle filtré — le plus « holographique ».

    Cohérent avec le Voice Filter spectral : même famille sonore, donc le
    réveil et la voix appartiennent au même objet.
    """
    n = int(RATE * duration)
    t = np.linspace(0, duration, n, endpoint=False)
    core = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 1.5 * t)

    noise = np.random.randn(n)
    # Passe-bas d'ordre 1 : le souffle brut est agressif, filtré il devient de l'air.
    b = np.zeros(n)
    alpha = 0.06
    for i in range(1, n):
        b[i] = b[i - 1] + alpha * (noise[i] - b[i - 1])
    b /= np.max(np.abs(b)) or 1.0

    return (0.75 * core + 0.45 * b) * env_attack_decay(n, attack=0.2, curve=2.6)


def dismiss(duration=0.14, f0=620.0, f1=380.0):
    """Contrepartie descendante, plus courte et plus discrète.

    Sert au retour au repos après un silence : il doit être presque
    subliminal — c'est un non-événement, pas une notification.
    """
    n = int(RATE * duration)
    freq = np.linspace(f0, f1, n)
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    return np.sin(phase) * env_attack_decay(n, attack=0.06, curve=3.0) * 0.7


def write(name: str, sig: np.ndarray, peak: float = 0.55) -> Path:
    """Normalise à un pic modeste : ce son ne doit jamais dominer la pièce."""
    sig = sig / (np.max(np.abs(sig)) or 1.0) * peak
    pcm = (sig * 32767).astype("<i2")

    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())
    return path


def main() -> int:
    np.random.seed(7)  # bloom reproductible d'une génération à l'autre
    made = [
        write("wake_rise.wav", rise()),
        write("wake_two_tone.wav", two_tone()),
        write("wake_bloom.wav", bloom()),
        write("dismiss.wav", dismiss()),
    ]
    for p in made:
        with wave.open(str(p)) as w:
            print(f"  {p.name:20} {w.getnframes()/w.getframerate()*1000:5.0f} ms")
    print(f"\n{OUT}")
    print("Choisir un candidat, le copier en wake.wav (cf. data/hud/orbe.yaml).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
