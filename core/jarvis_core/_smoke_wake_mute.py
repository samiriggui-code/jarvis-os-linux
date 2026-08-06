"""Smoke test — le mot de reveil se tait pendant que JARVIS parle.

Le montage de Samir est le pire cas : le son sort par la Bravia en HDMI, le
micro est sur la camera USB, et les deux partagent la meme piece. Sans garde,
JARVIS se reveille sur sa propre voix — et le barge-in de `voice/manager.py`
prend ca pour une interruption humaine et lui coupe la parole.

Ni micro ni openwakeword ici : on teste la MACHINE A ETATS, avec une horloge
et un drapeau « il parle » pilotes a la main.

    python -m jarvis_core._smoke_wake_mute
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.voice.wake import WakeWordDetector  # noqa: E402


class Rig:
    """Detecteur avec horloge manuelle et etat de parole pilotable."""

    def __init__(self, release_s: float = 1.5) -> None:
        self.t = 0.0
        self.speaking = False
        self.det = WakeWordDetector(
            lambda payload: None,
            config={"enabled": True, "mute_release_s": release_s},
            is_speaking=lambda: self.speaking,
        )

    def muted(self) -> bool:
        return self.det._muted(self.t)

    def advance(self, seconds: float) -> None:
        self.t += seconds


def main() -> None:
    # 1. Silence : le reveil ecoute normalement.
    r = Rig()
    assert not r.muted(), "etouffe alors que JARVIS se tait"

    # 2. JARVIS parle : etouffe.
    r.speaking = True
    assert r.muted(), "JARVIS parle et le reveil ecoute encore"

    # 3. LE piege : il vient de se taire, mais le tampon d'openwakeword
    #    contient encore sa voix (fenetre glissante ~1,5 s). Rouvrir tout de
    #    suite rendrait la garde inutile.
    r.speaking = False
    assert r.muted(), "reouverture immediate : le tampon contient sa voix"

    # 4. Apres la queue de silence, on reecoute.
    r.advance(1.6)
    assert not r.muted(), "toujours sourd 1,6 s apres la fin de la phrase"

    # 5. Une phrase longue prolonge l'etouffement en continu.
    r = Rig()
    r.speaking = True
    for _ in range(10):
        r.advance(0.5)
        assert r.muted(), "phrase longue : la garde a laché en cours de route"
    r.speaking = False
    r.advance(1.6)
    assert not r.muted()

    # 6. Delai configurable.
    r = Rig(release_s=0.2)
    r.speaking = True
    r.muted()
    r.speaking = False
    r.advance(0.3)
    assert not r.muted(), "mute_release_s ignore"

    # 7. Un `is_speaking` casse ne condamne pas JARVIS au silence.
    #    Micro trop bavard = desagrement ; JARVIS sourd a vie = panne.
    boom = WakeWordDetector(
        lambda p: None,
        config={"enabled": True},
        is_speaking=lambda: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    assert not boom._muted(0.0), "une sonde cassee a rendu JARVIS sourd"

    # 8. Sans `is_speaking` (montage casque, aucun risque d'echo) : jamais
    #    etouffe, et le statut le dit.
    plain = WakeWordDetector(lambda p: None, config={"enabled": True})
    assert not plain._muted(0.0)
    assert plain.status()["muted_by_tts"] is False
    assert Rig().det.status()["muted_by_tts"] is True

    # 9. Le compteur de diagnostic existe et part de zero.
    assert Rig().det.status()["self_triggers"] == 0

    print("OK - wake mute smoke passed")
    print("  parle -> etouffe | vient de se taire -> encore etouffe (tampon)")
    print("  +1,6 s -> reecoute | sonde cassee -> reste a l'ecoute")


if __name__ == "__main__":
    main()
