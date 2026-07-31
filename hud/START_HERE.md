# Par où commencer

**Important :** le projet n’est **pas** prêt à remplacer KDE ni à être « installé comme OS » sur le NUC.  
D’abord : **Core** stable ; les fronts React sont encore dans `vendor/figma1` / `figma2` (WIP).

Tout n’est **pas** dans `vendor/`. Le code **produit** actuel = surtout `core/` + `setup/`.  
`vendor/figma1` et `vendor/figma2` = fronts en cours (serveurs Vite OK) — ils remplaceront plus tard le front `jarvis_ai`, pas encore opérationnels comme couche produit.

## Carte mentale

```
PRODUIT (travaille ICI)              RÉFÉRENCES / WIP
─────────────────────                ────────────────
core/     orchestrateur              vendor/figma1  → futur HUD React
setup/    installateur React         vendor/figma2  → futur Dashboard
deploy/   sync NUC                   vendor/refs/jarvis_ai (moteur)
cahierdecharges.md                   vendor/vision/* (Holomat)
assets/   orbe + fonts               vendor/hors-scope/* = ignorer
```

Le dossier `hud/` Qt/QML a été **supprimé**. Ne pas le recréer.

## Ordre de travail

### 1 — Core qui tourne
```powershell
cd c:\laragon\www\jarvis-os-linux\core
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m jarvis_core
```

**Done quand :** `ws://127.0.0.1:8765` écoute.

> `core/` n'est pour l'instant que Policy + Provider. La cible est **Hermes Core** (managers Voice/Holomat/Tool/Agent/Discovery/Device/Memory + agents d'appareil) — détail dans [ARCHITECTURE.md](ARCHITECTURE.md) et cahier §2/§13. Ne pas s'étonner que le code actuel soit plus simple que la spec : c'est normal, à ce stade.

### 2 — Setup Center (optionnel)
```powershell
cd c:\laragon\www\jarvis-os-linux\setup
npm install
npm run dev
```

### 3 — Fronts (plus tard / en parallèle, dans vendor)
Adapter `vendor/figma1` (HUD) et `vendor/figma2` (Dashboard) au contrat Core / `jarvis_ai`.  
**Ne pas** fusionner encore dans `hud/` / `dashboard/` à la racine tant que ce n’est pas prêt.

### Plus tard
| Idée | Quand |
|------|--------|
| Promouvoir figma1 → `hud/` | Fronts stables |
| Promouvoir figma2 → `dashboard/` | Idem |
| Voice / Holomat | Après Core + un front branché |
| `vendor/hors-scope/relancr` | Ignorer |

## Fichiers utiles

1. [cahierdecharges.md](cahierdecharges.md) — le *quoi*
2. [ARCHITECTURE.md](ARCHITECTURE.md) — contrats
3. [README.md](README.md) — vue d’ensemble
4. Ce fichier — le *par où*
