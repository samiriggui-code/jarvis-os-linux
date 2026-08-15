# Brief — Composition HUD veille (présence, pas cockpit)

> **Statut :** validé Samir · **implémenté en local** (2026-08-11, complété soir : TopBar réel, bandeau fake out, ChatPeek, accès voix/DEV). Sync NUC sur demande.  
> **Date :** 2026-08-11.  
> **Liens :** `JARVIS_V2_CAHIER_DES_CHARGES.md` §8.18 · §8.19.12 · brief agentic  
> `docs/BRIEF_CURSOR_HUD_V2_AGENTIC.md` (inchangé — parallèle, pas remplacé).

## 1. Objectif unique

Repenser le **mode veille** du HUD : une composition de **présence** (orbe + statut + dialogue discret), plus un cockpit à 3 colonnes. Les outils (moniteur, apps, settings, etc.) restent dans le produit — ils **réapparaissent sur intention / surface**, pas en permanence.

Critère « terminé » (dev local) :

1. Au repos : pas de colonnes gauche/droite, pas de stats inventées, pas de quick-actions démo.
2. TopBar : identité + état + **métriques réelles** (ou tirets) + horloge ; **plus** de rangée de raccourcis.
3. Chat en **option C** : une ligne (dernière réplique / transcript) sous l’orbe ; tiroir plein à la demande.
4. Modes `surface` / `apps` / `dashboard` / auth : **inchangés** dans leur rôle (hors layout veille).
5. Validé visuellement en `npm run dev` local — **aucun sync NUC** dans ce chantier.

## 1bis. Accès après retrait des boutons TopBar

| Besoin | Voix / intent | DEV (Ctrl+Shift) | Lien / autre |
|--------|---------------|------------------|--------------|
| Apps / lanceur | « ouvre les apps » / « lanceur » | **A** | — |
| Settings (expérience) | « ouvre les paramètres » | **S** | catalogue `settings` |
| Gestes / Holomat | « ouvre les gestes » / Holomat | **G** | catalogue `vision` |
| Dashboard admin | « ouvre le dashboard » | **D** | URL / lien figé OK |
| Chat tiroir | peek sous orbe | **C** | — |
| Lock | « verrouille… » | **L** | — |
| Démo agentic | — | **U** ou `?agenticDemo=1` | — |

Dashboard = **auth admin** (inchangé). Pas de bouton permanent TopBar.

## 1ter. Dashboard « agentic capable » (phase 2 — pas ce brief)

- Aujourd’hui : Dashboard React (`Figma2Stage`) + lien / voix `dashboard` **figé OK**.
- Cible plus tard : pages Dashboard exposées aussi comme **surfaces registre** (mêmes données via `SURFACE_*`), pas un second dashboard.
- Ne pas bloquer la veille sur ça.

## 2. Composition cible (veille)

```
┌─────────────────────────────────────────────────────────┐
│ TopBar : Jarvis · état · stats RÉELLES · horloge        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                      ORBE (P6)                          │
│                                                         │
│              [ peek chat — 1 ligne ]                    │
│                   VoiceBar                              │
│                                                         │
└─────────────────────────────────────────────────────────┘
         ↓ ouverture peek / « ouvre le chat »
┌─────────────────────────────────────────────────────────┐
│              Tiroir chat (CommandConsole)               │
└─────────────────────────────────────────────────────────┘
```

Alignement Apex / V2 : **orbe + chat discret au repos** ; panels riches = événement / surface (§8.18), pas colonnes permanentes.  
§8.19.12 : orbe = centre ; secondaires atténués — ici les secondaires **permanents** du repos sont retirés (choix produit 2026-08-11, plus radical que « atténuer seulement »).

## 3. Décisions produit (figées)

| Élément | Décision |
|---------|----------|
| Stats milieu TopBar | **Garder** le slot ; **brancher du réel** (`SYSTEM_METRICS` + lien Core). Sans donnée → `—`, jamais de fake. |
| Labels TopBar | Remapper honnêtement : ex. En ligne (WS Core) · Charge (CPU) · Mémoire (RAM) · Menace ou Disque — **pas** « 1.2 Go/s » / « AES-256 » inventés. |
| Raccourcis droite TopBar | **Out** (notif démo, gestes, grille apps, dashboard, settings, lock boutons…). Accès = voix / intent / agentic. |
| Colonne gauche (Moniteur / Mémoire) | **Out** du repos. Ouverture via intent / surface / tuile agentic plus tard. |
| Stats bandeau au-dessus de l’orbe | **Out** (données inventées). |
| Quick actions (Scanner / Analyser…) | **Out** (démo). |
| Colonne droite Console / Recherche | **Out** du layout permanent. |
| Chat | **Option C** : peek 1 ligne sous orbe → tiroir `CommandConsole`. |
| VoiceBar | Reste sous le peek (contact vocal). |
| Porte de secours lock | Voix déjà (`hud.lock`) ; en DEV local, raccourci clavier optionnel OK (ex. pas de bouton chrome permanent). |

## 4. Fichiers / couches touchés (prévision)

| Zone | Fichiers probables |
|------|-------------------|
| Layout veille | `hud/src/app/App.tsx` |
| TopBar | `hud/src/app/components/TopBar.tsx` + `useSystemMetrics` / `isCoreOnline` |
| Chat C | nouveau petit composant (ex. `ChatPeek.tsx`) + réutilisation `CommandConsole.tsx` |
| Contexte | `AppContext` seulement si état `chatDrawerOpen` utile |

**Ne pas toucher :** rendu interne orbe (P6) · protocole surface · Core Python · auth scenes · sync NUC.

## 5. Hors-scope (explicit)

- Brancher toutes les intentions agentic pour chaque ex-raccourci (grille, gestes, settings…) — **phase 2** après validation visuelle veille.
- Unifier Glass `components/glass` vs `spatial` (§8.11).
- Terminal surface (étape 3 brief agentic).
- Moniteur/Mémoire en surface événementielle complète (sondes → `SURFACE_*`).
- Deploy / `sync-fronts-nuc.ps1`.

## 6. Accès post-retrait des boutons (phase 1 = minimal)

| Besoin | Phase 1 (ce chantier) | Phase 2 |
|--------|----------------------|---------|
| Chat | Peek + tiroir | — |
| Lock | Voix `verrouille…` (+ shortcut DEV si besoin) | — |
| Apps / Settings / Dashboard / Gestes | Toujours montés en React (`AppGrid`, etc.) mais **sans bouton TopBar** ; ouverture manuelle DEV via console React / intents existants si déjà câblés | Surfaces / voix systématiques |
| Moniteur | Absent veille | Surface sur sonde / intent |

Phase 1 assume : validation visuelle + chat C + TopBar réelle. La récupération complète « tout est ouvrable à la voix » n’est **pas** le critère de fin de ce brief.

## 7. Preuve

- `cd hud && npm run dev` — capture / validation Samir mode veille.
- `npm run typecheck` (ou équivalent projet) si la zone l’exige.
- Pas de sync NUC tant que Samir ne dit pas « sync ».

## 8. Ordre d’implémentation (après validation spec)

1. TopBar : métriques réelles + suppression raccourcis.
2. `App.tsx` veille : retirer colonnes, bandeau fake, quick actions.
3. ChatPeek + tiroir branché sur `CommandConsole` / messages existants.
4. Smoke visuel local → validation Samir → (plus tard) sync NUC.
