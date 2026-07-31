# JARVIS OS

**→ Nouveau ? Lis [START_HERE.md](START_HERE.md).**

Distribution Linux d’assistance (interfaces web + Core + Setup), au-dessus du noyau — pas dedans.

| Couche | Dossier | Techno | État |
|--------|---------|--------|------|
| **HUD** | [`hud/`](hud/) | React | Front produit (ex-`vendor/figma1`) |
| **Dashboard** | [`dashboard/`](dashboard/) | React | Front produit (ex-`vendor/figma2`) |
| **Core** | [`core/`](core/) | Python | Stub WS + Policy + Provider + Auth |
| **Setup** | [`setup/`](setup/) | React + Vite | Setup Center |
| **Deploy** | [`deploy/`](deploy/) | Manifestes + scripts | NUC / `/opt/jarvis` |
| **Assets** | [`assets/`](assets/) | Orbe + fonts | Réfs visuelles |
| **Vendor** | [`vendor/`](vendor/) | Upstream | Lecture seule (+ backups figma1/2) |
| **Spec** | [`cahierdecharges.md`](cahierdecharges.md) | Markdown | Cahier des charges |

> La tentative HUD **Qt/QML** a été **supprimée**. Fronts produit = React `hud/` + `dashboard/`. `vendor/figma1` / `figma2` = backup uniquement.

`core/` est aujourd'hui un stub (Policy + Provider). La cible est **Hermes Core** : un orchestrateur découpé en managers (Voice, Holomat, Tool, Agent, Discovery, Device, Memory, IoT Gateway, Recovery…) pilotant des agents d'appareil (Windows/Linux/Android/Mac) — voir [ARCHITECTURE.md](ARCHITECTURE.md#cible--hermes-core--dashboard-cahier-2-3-13) et cahier §2 / §13.

```
Windows (dev Core + fronts vendor)     WSL / Linux (Core)
            │                                    │
            └────────────── git ─────────────────┘
                              │
                        NUC Ubuntu (tests)
                        /opt/jarvis/{core,setup,…}
```

## Démarrage rapide (dev)

### Core
```bash
cd core
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m jarvis_core
# WebSocket: ws://127.0.0.1:8765
```

### Setup Center
```bash
cd setup
npm install
npm run dev
```

### Fronts produit
```bash
cd hud && npm install && npm run dev          # HUD → http://127.0.0.1:5173
cd dashboard && npm install && npm run dev    # Dashboard → http://127.0.0.1:5174
```

## Vendor — ce qui compte

| Chemin | Usage |
|--------|--------|
| `hud/` | **HUD React (produit)** |
| `dashboard/` | **Dashboard React (produit)** |
| `vendor/figma1/`, `vendor/figma2/` | Backup / archive (ne plus développer ici) |
| `vendor/refs/jarvis_ai/` | Moteur voix + contrat API (réf.) |
| `vendor/agents/hermes-agent/` | Hermes Agent (réf. / Docker) |
| `vendor/vision/` | Holomat / hand tracking |
| `vendor/ui/`, `vendor/services/` | Réfs installateur / voix |

Voir [ARCHITECTURE.md](ARCHITECTURE.md) et [CLAUDE.md](CLAUDE.md).
