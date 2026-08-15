# JARVIS Windows Agent (P4+)

**Version courante : `0.5.0-windows`** — voir [`CHANGELOG.md`](./CHANGELOG.md).

Agent **machine** — inventorie le PC, déclare les caps au Core, lance les apps.

## Démarrer en local (maintenant)

```powershell
cd deploy\windows-agent
.\start-local.ps1
```

→ **Icône dans la barre des tâches** (zone notification, près des apps réduites).  
Clic droit : statut · auto-découverte · **Paramètres** · HUD · Quitter.

Pas de page web. Habillage glass plus tard.

```powershell
.\launch-jarvis.ps1   # agent + ouvre le HUD navigateur
```

Debug HTTP (optionnel) : `JARVIS_AGENT_PANEL=1 python windows_agent.py`

## Installation automatique (recommandé)

**Une seule fois** — double-clic ou PowerShell :

```powershell
cd deploy\windows-agent
.\install-agent.ps1
```

Ça fait tout :
1. Copie l'agent dans `%ProgramData%\JARVIS\agent\`
2. Installe Python + dépendances
3. **Découvre le Core** (LAN `192.168.1.37`, Twingate `jarvis.global-it-ss.com`, tunnel local)
4. Écrit `%ProgramData%\JARVIS\agent.env`
5. Crée une **tâche planifiée au logon** (agent en arrière-plan)
6. Démarre l'agent immédiatement

### Lancer JARVIS (HUD + agent)

```powershell
.\launch-jarvis.ps1
```

→ ouvre le HUD dans le navigateur + vérifie que l'agent tourne.

### Téléchargement depuis le NUC (sans git)

Après `sync-to-nuc.sh`, le Core sert les fichiers sur `:8080/v1/agent/` :

```powershell
.\install-agent.ps1 -FromNuc
```

## Agent manuel (dev)

```powershell
cd deploy\windows-agent
..\..\core\.venv\Scripts\python.exe windows_agent.py
```

### Scan inventaire seul

```powershell
python windows_agent.py --scan-only
```

Sur ton portable : ~200–300 apps détectées, ~150+ lançables (registre, menu Démarrer, AppX, Program Files).

## Scan partiel vs complet

| Mode | Quand | Sources |
|------|-------|---------|
| **Partiel** | poll toutes les 2 min (défaut) | registre Uninstall + menu Démarrer |
| **Complet** | boot + 1 scan sur 6 polls | + AppX (PowerShell) + dossiers Program Files |

Quand une app est **installée ou désinstallée**, l'agent calcule un **diff** et **repousse les caps au Core** (nouvelle `app.software.{slug}`).

## Ce qui est déclaré au Core

| Capability | Exemple |
|------------|---------|
| `system.inventory` | total / lançables |
| `app.launch` | exécution autorisée |
| `app.software.cursor` | Cursor · exe · publisher |
| `app.software.{slug}` | une par app installée |
| `shell.execute` | planned (terminal local) |
| `filesystem.browse` | planned |

Refresh inventaire : poll `JARVIS_INVENTORY_POLL_S` (défaut 120 s) · scan complet périodique (1/6 polls).

## Découverte Core (zero-config)

**À chaque démarrage de l'agent**, probe réseau (le portable bascule maison ↔ bureau tout seul) :

| Priorité | Réseau | URL |
|----------|--------|-----|
| 1 | **LAN maison** | `ws://192.168.1.37:8080/ws` |
| 2 | **Internet** (Twingate) | `wss://jarvis.global-it-ss.com/ws` |
| 3 | **Tunnel dev** | `ws://127.0.0.1:8765` |

- **Desktop fixe** chez toi → toujours LAN.
- **Portable WiFi maison** → LAN (direct, rapide).
- **Portable au bureau** → LAN injoignable → bascule Internet.

Config `%ProgramData%\JARVIS\agent.env` mise à jour automatiquement quand le réseau change.

Forcer une URL fixe (desktop) :

```powershell
JARVIS_WS_URL=ws://192.168.1.37:8080/ws
JARVIS_WS_URL_FORCE=1
```

Test : `python discover.py --save`

## Voix / Core

| Commande | Intent |
|----------|--------|
| « ouvre Cursor » | `core.cursor` |
| « logiciels du portable » | `devices.software` |
| « ouvre l'application … » | `device.app_launch` (match inventaire) |

## Variables

| Variable | Défaut |
|----------|--------|
| `JARVIS_WS_URL` | auto-découverte |
| `JARVIS_HUD_URL` | auto (même host que WS) |
| `JARVIS_AGENT_LABEL` | hostname |
| `JARVIS_INVENTORY_MAX` | `500` |
| `JARVIS_INVENTORY_POLL_S` | `120` (push caps si diff) |
| `JARVIS_INVENTORY_APPX` | `1` |
| `JARVIS_INVENTORY_PROGRAM_DIRS` | `1` |

Config persistée : `%ProgramData%\JARVIS\agent.env`  
Logs agent : `%ProgramData%\JARVIS\logs\agent.log`

## Désinstallation

```powershell
.\install-agent.ps1 -Uninstall
```

## Fake agent (CI)

```bash
python fake_agent.py --url ws://127.0.0.1:8765
```

## Prochaines étapes (non codées)

- `shell.execute` — PowerShell local (Policy + allowlist)
- `filesystem.browse` — fichiers PC
