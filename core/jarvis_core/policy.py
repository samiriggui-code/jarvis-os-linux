"""Policy Engine — l'IA propose, les règles décident."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, IntEnum


class RiskLevel(IntEnum):
    INFO = 1
    MEDIA = 2
    HOME = 3
    ADMIN = 4
    VPS = 5  # shell/docker/deploy — allowlist only, never free root


class Operation(str, Enum):
    """Type d'opération technique — orthogonal à `RiskLevel`.

    `RiskLevel` répond « quelle conséquence produit si ça tourne mal » ;
    `Operation` répond « quel genre d'action technique est-ce ». Une capacité
    `HOME` (allumer une lampe) est `WRITE` ; une capacité `VPS` (terminal) est
    `EXECUTE`. Les deux axes servent la Policy, aucun ne remplace l'autre.
    """

    READ = "read"
    WRITE = "write"
    EXECUTE = "execute"
    DESTRUCTIVE = "destructive"


@dataclass
class Decision:
    allowed: bool
    needs_confirmation: bool = False
    reason: str | None = None


class PolicyEngine:
    """Règles : admin/VPS toujours confirmation ; VPS hors allowlist = refus."""

    _ADMIN_HINTS = (
        "supprime",
        "rm -rf",
        "format",
        "shutdown",
        "reboot",
        "root",
        "firewall",
        "ouvre la porte",
        "passwd",
        "iptables",
        "curl | bash",
        "curl|bash",
    )

    # Aligné HUD VPS_ALLOWLIST (revue apps)
    _VPS_ALLOW_HINTS = (
        "systemctl status jarvis",
        "journalctl -u jarvis",
        "docker ps",
        "docker logs",
        "docker stats",
        "df -h",
    )

    # Terminal admin (Dashboard) → Pi salon — diagnostics uniquement, jamais
    # d'action qui coupe le wake word ou la caméra à distance sans quelqu'un
    # sur place pour la rallumer.
    _PI_ALLOW_HINTS = (
        "systemctl status jarvis-ear",
        "systemctl status jarvis-cam",
        "journalctl -u jarvis-ear",
        "journalctl -u jarvis-cam",
        "df -h",
    )

    def evaluate(
        self,
        action: str,
        text: str = "",
        risk: RiskLevel = RiskLevel.INFO,
        operation: Operation | None = None,
    ) -> Decision:
        lowered = text.lower()
        if any(h in lowered for h in self._ADMIN_HINTS):
            # Refus dur, jamais « à confirmer » : ces mots-clés (rm -rf,
            # format, shutdown, root, passwd, iptables, curl|bash…) désignent
            # des gestes qu'un simple clic d'approbation ne doit jamais
            # pouvoir débloquer. `text` n'était passé nulle part avant le
            # chantier Terminal admin (2026-08-09) : cette branche était donc
            # inerte partout où une carte d'approbation existe — elle ne l'est
            # plus, il fallait donc la rendre honnête d'abord.
            return Decision(
                allowed=False,
                needs_confirmation=False,
                reason="Action sensible refusée (Policy Engine).",
            )
        if operation is Operation.DESTRUCTIVE:
            # Indépendant du RiskLevel : une opération destructive se confirme
            # toujours, même si le produit la juge par ailleurs peu grave.
            return Decision(
                allowed=True,
                needs_confirmation=True,
                reason="Opération destructive — confirmation requise (Policy Engine).",
            )
        if risk >= RiskLevel.VPS or action.startswith("vps_"):
            if text and not any(h in lowered for h in self._VPS_ALLOW_HINTS):
                # Hors allowlist = refus, pas juste « à confirmer » — un clic
                # sur une carte d'approbation ne doit pas pouvoir faire passer
                # une commande que l'allowlist a explicitement exclue.
                return Decision(
                    allowed=False,
                    needs_confirmation=False,
                    reason="VPS limité — commande hors allowlist, refusée (Policy Engine).",
                )
            return Decision(
                allowed=True,
                needs_confirmation=True,
                reason="VPS allowlist — confirmation ADMIN requise.",
            )
        if action == "pi.terminal":
            if text and not any(h in lowered for h in self._PI_ALLOW_HINTS):
                return Decision(
                    allowed=False,
                    needs_confirmation=False,
                    reason="Pi salon limité — commande hors allowlist, refusée (Policy Engine).",
                )
            return Decision(
                allowed=True,
                needs_confirmation=True,
                reason="Pi salon allowlist — confirmation ADMIN requise.",
            )
        if risk >= RiskLevel.ADMIN:
            return Decision(
                allowed=False,
                needs_confirmation=True,
                reason="Action sensible — confirmation requise (Policy Engine).",
            )
        if risk >= RiskLevel.HOME:
            return Decision(allowed=True, needs_confirmation=True, reason="Domotique : confirmer.")
        return Decision(allowed=True)
