# Plan — Port QML Figma 1 fidèle (stop bricolage)

## Verdict

Le problème n’est pas « un détail VoiceBar ». C’est la méthode : on a **approximé** le React au lieu d’**extraire composant par composant** depuis `vendor/figma1` avec les mêmes noms, tailles et hiérarchie que `App.tsx`.

**Décision :** reset méthodologique du dossier `hud/qml/figma1/` — 1 fichier React produit = 1 fichier QML (hors `ui/` shadcn), layout shell figé d’abord, puis panels, puis overlays. Pas d’invention. Mock data OK. Pas de branchement Core dans cette passe.

## Source de vérité

| Priorité | Source |
|----------|--------|
| 1 | `vendor/figma1/src/app/App.tsx` + `context/AppContext.tsx` |
| 2 | Chaque fichier dans `vendor/figma1/src/app/components/*.tsx` (hors `ui/`) |
| 3 | Capture utilisateur NEXUS (référence visuelle) |
| ❌ | Anciennes notes / proto bricolé / Figma MCP Make |

Fonts : Orbitron / Share Tech Mono / Rajdhani (déjà dans Theme + fonts.css).  
Couleurs clés : `#00f5ff`, `#a855f7`, `#22c55e`, `#f59e0b`, `#0ea5e9`, fond `#010812`.

## Gap actuel (pourquoi ça « foirait »)

| React | QML actuel | Statut | Écart |
|-------|------------|--------|-------|
| `Background.tsx` | inline Canvas dans Main | partial | pas de particles, pas de blobs, pas de corner accents |
| `TopBar.tsx` | `TopBar.qml` | partial | structure OK, pas 1:1 icons/hover |
| `AICore.tsx` | `AICore.qml` | partial | scale hack ; data points % autour de l’orbe incomplets |
| `SystemMonitor.tsx` | `MonitorPanel.qml` (**mauvais nom**) | partial | MetricCard / live series / charts incomplets |
| `MemoryPanel.tsx` | `MemoryPanel.qml` | partial | à revérifier ligne à ligne |
| `CommandConsole.tsx` | `ConsolePanel.qml` (**mauvais nom**) | partial | messages/typing/suggestions |
| `SearchPanel.tsx` | `SearchPanel.qml` | partial | |
| `VoiceBar.tsx` | `VoiceBar.qml` | partial | layout corrigé mais pas extrait propre ; BAR_COUNT=32 en React |
| `AppDock.tsx` | `AppDock.qml` | partial | |
| `SettingsPanel.tsx` | `SettingsOverlay.qml` | partial | sections React ≠ JARVIS front notes |
| `GesturePanel.tsx` | `GestureOverlay.qml` | partial | |
| `AppGrid.tsx` | `AppGridOverlay.qml` | partial | |
| `ScanningPanel.tsx` | **ABSENT** | missing | |
| `NotificationSystem.tsx` | **ABSENT** | missing | |
| `PanelTab` (App.tsx) | inline Repeater | missing as file | |
| `QuickActionButton` | inline | missing as file | |
| `MetricCard` | inline Canvas | missing as file | |
| `Ring` (AICore) | inline Rectangle | missing as file | |
| Layout shell | Main ColumnLayout | wrong | React: `marginTop:56`, `marginBottom:144` (Voice 72+Dock 72), panels `w-72`=288, `gap-4`=`16` |

## Architecture QML cible (miroir React)

```
hud/qml/figma1/
  Main.qml                 ← App.tsx MainLayout only (shell wiring)
  Background.qml
  TopBar.qml
  PanelTab.qml
  GlassPanel.qml           ← glassPanel() helper
  NeuralStrip.qml          ← bande NEURAL OPS / CONTEXT / …
  QuickActionButton.qml
  AICore.qml
  OrbRing.qml              ← Ring from AICore
  SystemMonitor.qml        ← rename from MonitorPanel
  MetricCard.qml           ← progress + area sparkline live
  MemoryPanel.qml
  CommandConsole.qml       ← rename from ConsolePanel
  SearchPanel.qml
  VoiceBar.qml             ← [toggle][wave CENTER][mic] exact
  AppDock.qml
  ScanningOverlay.qml
  AppGridOverlay.qml
  SettingsOverlay.qml
  GestureOverlay.qml
  NotificationHost.qml
```

Entrypoint inchangé : `hud/main_figma1.py`.

## Contraintes layout (non négociables, chiffres React)

1. **Shell vertical** : TopBar `h-14` = **56** → zone centrale `flex-1` avec **marginTop 56** et **marginBottom 144** → VoiceBar **72** + AppDock **72**.
2. **3 colonnes** : gauche/droite **288** (`w-72`), centre `flex-1`, `gap-4` = **16**, `px-4` = **16**.
3. **VoiceBar** : fixed bottom **72** above dock ; children = mode toggle gauche | waveform **centré flex-1** | mic droite + label état.
4. **Overlays** : jamais remplacer le shell ; empilés au-dessus (Scanning, AppGrid, Settings, Gesture, Notifications).
5. **Couleurs QML** : uniquement `#AARRGGBB` / `Qt.rgba` — **jamais** strings CSS `rgba(...)` hors Canvas 2D.
6. **Noms** = noms React (SystemMonitor, CommandConsole) pour traçabilité.

## Méthode d’exécution (ordre strict)

### Phase 0 — Inventaire figé
Créer `hud/qml/figma1/PORT.md` (mapping 1 ligne = 1 composant + status).  
Supprimer / renommer les fichiers « bricolage » (MonitorPanel→SystemMonitor, ConsolePanel→CommandConsole).  
Enlever tout debug UI (barre rouge déjà à virer si encore présente).

### Phase 1 — Shell geometry only
Réécrire `Main.qml` pour coller à `MainLayout` :
- Background plein écran
- TopBar 56
- Row centrale avec margins React
- VoiceBar + AppDock en bas (somme 144)
- Loaders panels + stubs overlays

**Critère done :** sur capture côte à côte, les bandes Top / Voice / Dock et largeur panels matchent.

### Phase 2 — Composants atomiques
`PanelTab`, `GlassPanel`, `MetricCard` (series timer 2s comme React), `OrbRing`, `QuickActionButton`, `NeuralStrip`.

**Critère done :** MetricCard a header + progress + sparkline area (stroke 1.5, fill gradient), pas une barre seule.

### Phase 3 — Panels 1:1
Porter dans l’ordre : `SystemMonitor` → `MemoryPanel` → `CommandConsole` → `SearchPanel` → `AICore` → `VoiceBar` → `AppDock` → `TopBar`.  
Pour chaque fichier : ouvrir le `.tsx`, recopier structure/enfants/tailles, coller capture.

### Phase 4 — Overlays manquants
`ScanningPanel`, `NotificationSystem`, puis aligner Settings/Gesture/AppGrid sur le React (pas sur FIGMA1_NOTES si conflit avec le rendu Community — **le rendu React vendor gagne** pour ce prototype HUD).

### Phase 5 — Vérif
- Load QML `ROOTS 1` via venv
- Checklist visuelle vs capture : orbe, metrics charts, voice centre, dock, top status row
- Pas de merge Figma 2 dans cette passe

## Hors scope (cette passe)

- Brancher Core / systemd / mic réel
- Figma 2 Machine panel
- Adapter le contenu Settings aux notes « Moi & mon JARVIS » (après fidélité visuelle)

## Risques

| Risque | Mitigation |
|--------|------------|
| Fenêtre < contenu → overlap | garder scale AICore **seulement** si height < natural ; shell margins d’abord corrects |
| Canvas charts moches | MetricCard isolé + paint test ; données rolling 25 pts comme React |
| Trop long | phases done-gated ; Phase 1 visible avant Phase 3 |

## Première action dès validation

Phase 0+1 uniquement : mapping PORT.md + Main shell geometry + renames. Ensuite MetricCard/SystemMonitor (charts) + VoiceBar exact — les deux points que tu as signalés.
