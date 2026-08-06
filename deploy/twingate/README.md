# Twingate pour JARVIS — guide débutant

## En une image

```
Ton PC / téléphone          Internet           Maison
[Client Twingate]  ──────►  Twingate cloud  ──► [Connector sur le NUC]
     │                                              │
     └── tu tapes http://192.168.1.37:8080  ────────┘
         (comme si tu étais à la maison)
```

- **Connector** = déjà installé sur le NUC (vert / Online) ✓
- **Client** = appli à installer sur CHAQUE appareil qui doit voir le HUD
- **Resource** = « quelles IP de la maison mon Client a le droit d’atteindre »

Sans Client + Resource, le navigateur ne joindra jamais `192.168.1.37`.

---

## Étape 1 — Client sur ton PC (Windows)

1. Va sur https://www.twingate.com/download (ou le lien dans la console)
2. Installe **Twingate Client**
3. Ouvre l’appli → Network name : **`globalitss`**
4. Connecte-toi avec le même compte que la console admin
5. L’icône doit passer **Connected**

Même chose sur téléphone (App Store / Play Store) si tu veux le HUD sur mobile.

---

## Étape 2 — Resource (une seule suffit pour commencer)

Dans la console https://globalitss.twingate.com :

1. Menu **Network** → **Resources** → **Add Resource**
2. Remplis :
   - **Name** : `Jarvis LAN`
   - **Address** : `192.168.1.0/24`  
     (tout le réseau maison : NUC, Pi, HUD…)
3. **Remote Network** : celui où tourne le Connector NUC (ex. Jarvis Maison)
4. **Groups** : coche ton groupe (souvent **Everyone** ou ton nom)
5. Save

Si tu préfères plus serré, crée plutôt :
- Address `192.168.1.37` (NUC seul : HUD + SSH)
- Address `192.168.1.27` (Pi)

---

## Étape 3 — Ouvrir le HUD

Client Twingate **Connected**, puis dans le navigateur :

```
http://192.168.1.37:8080/?boot=0
```

SSH (toujours avec Client Connected) :

```
ssh jarvis-nuc
ssh jarvis-pi
```

(les alias LAN marchent via Twingate ; `jarvis-nuc-wan` reste le secours Freebox)

---

## Fichiers secrets (déjà faits)

| Fichier | Contenu |
|---------|---------|
| `connector.env` | Access + Refresh du Connector (NUC) |
| `api.key` | clé API admin (optionnel, pour scripts) |

Ne jamais committer ces fichiers.
