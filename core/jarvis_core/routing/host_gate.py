"""Host gate — disponibilité selon CapabilityProvider (Phase 6)."""
from __future__ import annotations

from ..devices import _default_nuc_id
from .provider import CapabilityProvider, provider_for_intent
from .router import CapabilityRouter, RouteContext, RouteResult


def resolve_execution_host(
    router: CapabilityRouter,
    ctx: RouteContext,
    intent: str,
) -> RouteResult:
    """Décide si l'intention peut s'exécuter et sur quelle machine.

    CORE in-process : le NUC héberge l'adaptateur — aucun satellite requis.
    SATELLITE : interroge le DeviceRegistry (HostCapability).
    Absent du registre provider : pas de gate host.
    """
    provider = provider_for_intent(intent)
    if provider is CapabilityProvider.CORE:
        return RouteResult(_default_nuc_id(), "core_in_process")

    host_cap = CapabilityRouter.capability_for_intent(intent)
    if host_cap and provider is CapabilityProvider.SATELLITE:
        return router.resolve_host_device(ctx, host_cap)

    if host_cap and provider is None:
        # Legacy : intent mappé sans provider explicite → satellite.
        return router.resolve_host_device(ctx, host_cap)

    return RouteResult(_default_nuc_id(), "no_host_requirement")
