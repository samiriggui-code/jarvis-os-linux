---
name: ecosystem-hosts
description: >-
  Routage multi-hôte JARVIS : VPS (cerveau/dashboard), NUC (kiosk + apps locales),
  PC Windows (agent + Netflix/Prime), TV / HA (lampe, lave-linge, caméras).
  Ouvrir la bonne app sur la bonne machine. Setup installe d’abord les outils VPS.
---

# Skill — Écosystème multi-hôte

## Cartographie

| Host | Rôle | Apps / actions typiques |
|------|------|-------------------------|
| **VPS** | Cerveau, Dashboard, Docker, Hermes, Policy | docker limited, terminal allowlist, deploy, tokens |
| **NUC** | HUD kiosk + médias locaux | Plex / Plexamp, VLC, VS Code, apps installées NUC → bibliothèque ProLiant |
| **PC Windows** | Agent portable | Apps système + Netflix, Prime, Edge, Explorer… via agent Windows |
| **TV / HA** | Salon / maison | HA entities : TV, lampes, lave-linge WiFi, caméras (plus tard) |
| **ProLiant (Windows)** | Médias uniquement | Plex + bibliothèque / NAS — **pas d’Ollama**, **pas de SSH**, pas d’agent OS |

## Règle d’or

```
Intent utilisateur
  → Hermes détecte le host actif (où parle / où regarde)
  → Choisit l’agent d’appareil (§13)
  → Policy (media < home < admin < vps)
  → Exécute sur CE host (pas le mauvais)
```

Exemples :
- Sur **NUC** : « Jarvis ouvre Plex » → lance client Plex NUC (studio / app) vers lib ProLiant.
- Sur **Windows portable** : « Jarvis Netflix » → agent Windows démarre Netflix UWP/Store.
- Sur **TV** : « Jarvis allume le salon » → HA light.* ; lave-linge = entity HA si WiFi.
- **VPS** : jamais d’ouvrir Netflix sur le VPS ; seulement outils admin allowlist.

## Setup — ordre d’install

1. **BASE** (toujours)
2. **Outils VPS** (si profil VPS / complet) : docker CLI client, compose, ssh allowlist, Portainer URL, recovery
3. **HUD + Voice** (NUC)
4. **Médias NUC** : Plex client, VLC
5. **HA** (maison)
6. **Agent Windows** (laptop) — paquet séparé
7. Caméras / IoT = enrollment Discovery + appairage (jamais auto-rights)

## Voice UI

- Défaut : **mode voix** — pas de clic HUD/Dashboard.
- « Jarvis mode recovery » / Ctrl+Alt+R → maintenance.
- « Jarvis dashboard tokens » → page `#/dashboard` (récap tokens).
- « Jarvis dashboard hermes|docker|… » → nav sections.

## Ajout d’outil

Via `outils` / tool_manager + déclarer `host: vps|nuc|windows|ha` + risk.
