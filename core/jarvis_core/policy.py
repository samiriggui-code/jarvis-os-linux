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

    def evaluate(
        self,
        action: str,
        text: str = "",
        risk: RiskLevel = RiskLevel.INFO,
        operation: Operation | None = None,
    ) -> Decision:
        lowered = text.lower()
        if any(h in lowered for h in self._ADMIN_HINTS):
            return Decision(
                allowed=False,
                needs_confirmation=True,
                reason="Action sensible refusée / confirmation ADMIN (Policy Engine).",
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
                return Decision(
                    allowed=False,
                    needs_confirmation=True,
                    reason="VPS limité — commande hors allowlist (Hermes propose, Policy tranche).",
                )
            return Decision(
                allowed=True,
                needs_confirmation=True,
                reason="VPS allowlist — confirmation ADMIN requise.",
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
