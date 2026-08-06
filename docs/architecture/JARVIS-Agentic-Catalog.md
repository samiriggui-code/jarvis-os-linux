# Catalogue agentic — hubs & enrichissement

> Complément de [`JARVIS-Agentic-UI.md`](./JARVIS-Agentic-UI.md).  
> Décision produit 2026-08-06.

## Ce qu’on ne fait **pas**

Importer « un million » de composants shadcn/ReUI/MUI dans le registre.  
Raison : **budget d’attention** (max 12 composants / surface), P1 (pas de JSX généré), P4 (registre produit JARVIS), P6 (pas de double design system).

Les libs (AG-UI, CopilotKit, ReUI, A2UI) = **patterns**, pas runtime.

## Notion de **Hub** (retenue)

Un hub n’est **pas** une app de plus dans le dock. C’est une **surface préfabriquée domaine** :

| Hub | Domaine | Briques typiques |
|-----|---------|------------------|
| **StatusHub** | NUC / VPS / Pi / tunnels | `ServiceHub` + `StatCard` + `MetricChart` + `SystemMonitor` |
| **MediaHub** | Plex / Spotify / caméra | `CameraPreview` + `DataTable` + `LinkList` |
| **HomeHub** | HA / pièces | `KeyValueList` + `ActionRequest` + `ApprovalCard` |
| **DevHub** | Mission Control / Cursor | `DataTable` projets + `ResultPanel` + `CommandConsole` |
| **ReachHub** | Web / recherche | `ResultPanel` + `LinkList` + `ToastStack` |

L’agent ouvre un hub **ou** compose à la carte. Le **redimensionnement intelligent** = `preferredRegion` + `preferredSize` + `priority` du composeur HUD (pas l’agent qui pose des pixels).

`ServiceHub` est la première brique « hub » du catalogue : une liste services/hôtes avec statut.

## Vague catalogue (2026-08-06)

Ajouts : `SectionHeader`, `StatCard`, `InfoCard`, `StatusBadge`, `AvatarChip`, `LinkList`, `KeyValueList`, `DataTable`, `MetricChart`, `DialogCard`, `ToastStack`, `ServiceHub`.

Total cible ≈ **23** composants (11 historiques + 12). Suffisant pour composer ; extensible par vagues, jamais par dump.

## Vitrine

- HTML : `/agentic-lab.html`
- HUD dev : `?surface=catalogue` + fenêtre terminal
