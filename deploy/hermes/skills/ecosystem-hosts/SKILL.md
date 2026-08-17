---
name: ecosystem-hosts
description: >-
  TRIGGER — routage multi-hôte (VPS, NUC, Windows, Pi). Charger seulement si la
  question porte sur « où tourne », quel host, tunnel, ou architecture réseau.
  Ne PAS charger pour salutation, chat casual, heure, météo, domotique (→ Core/HA).
---

# Skill — Écosystème multi-hôte

## Cartographie

| Host | Rôle | Apps / actions typiques |
|------|------|-------------------------|
| **VPS** | TLS, WSS, Ollama | Admin allowlist |
| **NUC** | HUD + HA + couche JARVIS + Hermes | Plex, streaming HA |
| **PC Windows** | Agent portable | Cursor, apps |
| **Pi salon** | Satellite I/O | Cam, ear, Zigbee vers HA NUC |
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
- Sur **NUC** : « Netflix Apple TV chambre » → couche JARVIS → HA `media_player` (Policy).
- Sur **Windows portable** : « Ouvre Cursor » → agent Windows (`dev.agent.run`).
- Sur **TV / maison** : « allume le salon » → couche JARVIS → HA `light.*`.
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
