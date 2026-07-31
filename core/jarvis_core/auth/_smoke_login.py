"""Smoke test — `login()` n'accepte pas une identité affirmée par le client.

Ce test existe à cause d'un trou réel : `login(user_id=…)` ouvrait une session
sur simple lookup, sans rien vérifier. Un message WebSocket suffisait :

    {"type":"auth","action":"login","user_id":"<id de l'admin>"}

et l'on obtenait une session administrateur sans caméra, sans micro, sans PIN.

Les cinq cas ci-dessous sont ceux qui doivent rester vrais pour toujours. Si
l'un d'eux casse, c'est que le chemin d'authentification s'est rouvert.

    python -m jarvis_core.auth._smoke_login
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from jarvis_core.auth import AuthService, UserManager  # noqa: E402
from jarvis_core.auth.service import ENV_ALLOW_UNVERIFIED  # noqa: E402


def main() -> int:
    # L'échappatoire de développement fausserait tout le test.
    os.environ.pop(ENV_ALLOW_UNVERIFIED, None)

    with tempfile.TemporaryDirectory(prefix="jarvis_login_") as tmp:
        # `close()` en finally : sous Windows, SQLite garde le fichier ouvert
        # et le nettoyage du dossier temporaire échoue sur un PermissionError
        # qui masquerait le vrai résultat du test.
        users = UserManager(Path(tmp) / "test.db")
        try:
            _cas(AuthService(users))
        finally:
            users.close()

    print("OK — login smoke passed")
    print("  identité affirmée par le client : refusée (user_id et username)")
    print("  PIN : vérifié pour de bon | attestation : usage unique, non transférable")
    print("  confiance retenue = celle mesurée par le Core, pas celle annoncée")
    return 0


def _cas(auth: AuthService) -> None:
        admin = auth.enroll("samir", pin="1234", face=True)["user"]
        autre = auth.enroll("zahra", pin="9999", face=True)["user"]

        # 1. Identité affirmée par le client, sans preuve : REFUS.
        assert not auth.login(
            user_id=admin["id"], method="face", confidence=0.99
        )["ok"], "user_id sans attestation accepté"
        assert not auth.login(
            username="samir", method="face", confidence=0.99
        )["ok"], "username sans attestation accepté"

        # 2. Le PIN reste un chemin légitime — il est réellement vérifié.
        assert auth.login(username="samir", pin="1234")["ok"], "PIN correct refusé"
        assert not auth.login(username="samir", pin="0000")["ok"], "PIN faux accepté"

        # 3. Parcours normal : le Core a reconnu le visage, puis le HUD demande
        #    l'ouverture de session.
        auth.attest_biometric(admin["id"], "face", 0.91)
        assert auth.login(
            user_id=admin["id"], method="face", confidence=0.99
        )["ok"], "login après attestation refusé"
        # La confiance retenue est celle MESURÉE par le Core, pas celle
        # annoncée par le client : sinon n'importe qui déclare 0.99.
        assert auth.active is not None and abs(auth.active.confidence - 0.91) < 1e-6, (
            "la confiance du client a été retenue à la place de celle du Core"
        )

        # 4. Usage unique : une reconnaissance ouvre UNE session.
        assert not auth.login(
            user_id=admin["id"], method="face", confidence=0.99
        )["ok"], "attestation rejouable"

        # 5. Une attestation ne vaut que pour son porteur.
        auth.attest_biometric(admin["id"], "face", 0.91)
        assert not auth.login(user_id=autre["id"])["ok"], (
            "attestation transférable d'un utilisateur à l'autre"
        )


if __name__ == "__main__":
    sys.exit(main())
