# JARVIS OS — règles du projet

> Miroir Cursor : `.cursor/rules/` (`project.mdc`, `cahier-des-charges.mdc`, `core.mdc`, `setup.mdc`, `vendor-upstream.mdc`, `settings-split.mdc`).

## État du projet

- Spec : [cahierdecharges.md](cahierdecharges.md) (sections `## N.`, renvois `§N`). Vue d’ensemble : [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md).
- Monorepo :
  - [core/](core/) — orchestrateur WS + Policy + Provider + Auth
  - [hud/](hud/) — HUD React (**produit**, ex-figma1)
  - [dashboard/](dashboard/) — Dashboard React (**produit**, ex-figma2)
  - [setup/](setup/) — Setup Center React
  - [deploy/](deploy/) — manifestes + sync NUC
  - [assets/](assets/) — orbe + fonts
  - [vendor/figma1](vendor/figma1/), [vendor/figma2](vendor/figma2/) — **backup** uniquement
  - [vendor/](vendor/) — upstream / refs
- **HUD Qt/QML : supprimé.** Ne pas le recréer. Ne pas inventer un composant du cahier comme « déjà en prod » sans vérifier le dossier.

## Architecture à respecter

- **HUD / Dashboard** : React (kiosque navigateur). Travail actuel dans `hud/` / `dashboard/`.
- **Un service systemd par fonction** (`jarvis-hud`, `jarvis-core`, `jarvis-voice`, …). Jamais un monolithe.
- **L'orchestrateur délègue** aux agents (voix, vision, maison, système, média, développeur, sécurité).
- **Accès LLM toujours via l'AI Provider Manager** : Ollama local → serveur perso → cloud → mode sans LLM.
- **JARVIS BASE** doit survivre sans HUD / IA / domotique.

## Sécurité — non négociable

- L'IA ne reçoit **jamais** les droits root/admin directement. Proposition → Policy Engine → Autorisation → Exécution.
- Secrets : jamais en dur, jamais commités.
- Actions graduées (info < média < domotique < admin).
- Données externes filtrées avant LLM.
- Discovery ≠ droits (appairage explicite).
- IoT isolé du Core.

## Quand tu modifies `cahierdecharges.md`

Utiliser le skill `cahier-des-charges` (`.claude/skills/cahier-des-charges/`).

## Points ouverts (demander avant de trancher)

- Auth / appairage par type d'appareil.
- Coffre à secrets (Secret Service / KWallet / Vault ?).
- Réconciliation profils install vs usages (§2 / §5).
