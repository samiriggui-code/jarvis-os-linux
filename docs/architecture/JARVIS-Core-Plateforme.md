# JARVIS Core — plateforme personnelle d'intelligence distribuée

> **Statut** : **vision consignée, non validée.** Ce document énonce la cible et
> l'état réel du dépôt en regard. Il ne tranche rien : les décisions ouvertes du
> §7 attendent un arbitrage.
> **Rédigé** : 2026-08-05, d'après la note de vision de Samir.
> **Voisins** : [`JARVIS-Agentic-UI.md`](JARVIS-Agentic-UI.md) (contrat validé,
> couche interface), [`hud/cahierdecharges.md`](../../hud/cahierdecharges.md) (spec produit).
>
> Aucun code, aucune migration. Le §5 mesure l'écart entre la cible et le dépôt à
> la date de rédaction — il vieillira, et c'est normal : le relire avant de s'en servir.

---

## 1. La thèse

**JARVIS n'est pas une application. C'est une plateforme.**

Le corollaire est plus exigeant qu'il n'en a l'air :

> Les modèles d'IA — Claude, Ollama, OpenRouter, Gemini — **ne sont pas JARVIS**. Ce
> sont des moteurs cognitifs interchangeables que le Core utilise selon le besoin.

Un assistant conversationnel meurt avec son modèle. Une plateforme lui survit. Tout ce
qui suit découle de cette phrase, y compris ce qui semble n'être que de la plomberie.

---

## 2. Architecture cible

```
                    JARVIS CORE
                         |
        ---------------------------------
        |              |                |
     Hermes        Skills          Device Manager
        |              |                |
   Raisonnement    Compétences     Périphériques
        |
   Mission Control
        |
   Evolution Lab
        |
   Agents développeurs
```

### Ce que le Core gère

Identité, mémoire, contexte utilisateur, permissions, événements, communication entre
services, appareils, chargement des compétences, orchestration.

**Le Core doit rester stable.** Il n'est jamais remplacé par un agent IA.

### Ce qu'Hermes fait

Comprendre, planifier, choisir les outils, **proposer** des actions.

Hermes n'est pas le noyau : il travaille pour lui. Le verbe « proposer » n'est pas un
adoucissement — c'est la même frontière que la règle de sécurité du dépôt : l'IA ne
reçoit jamais les droits directement (`Proposition → Policy Engine → Autorisation →
Exécution`).

---

## 3. Compétences (Skills)

JARVIS évolue par **ajout**, pas par modification.

```
Core
 ├── Skill Home Assistant      ├── Skill Media
 ├── Skill Vision              ├── Skill Security
 ├── Skill Voice               ├── Skill Glasses
 ├── Skill DevOps              └── Skill Development
```

**Le critère de réussite :** ajouter une capacité ne doit pas obliger à toucher au reste
du système. Tant que ce n'est pas vrai, ce ne sont pas des compétences, ce sont des
branches d'un `if`.

---

## 4. Device Manager

Chaque appareil **déclare** ses capacités ; le Core choisit le meilleur disponible.

| Appareil | Capacités déclarées |
|---|---|
| iPhone | micro · caméra · haut-parleur · GPS · Bluetooth |
| NUC | micro · caméra · écran |
| Lunettes AR | caméra · micro · audio |

Le choix est fait par le Core, pas codé en dur dans l'appelant. « Le meilleur
disponible » suppose donc trois choses qui n'existent pas encore : un inventaire, une
notion de qualité par capacité, et une réservation — deux consommateurs ne peuvent pas
tenir le même objectif.

---

## 5. Écart entre la cible et le dépôt

> Mesuré le 2026-08-05. À relire avant usage.

| Brique | Cible | État réel |
|---|---|---|
| **Moteurs interchangeables** | modèles remplaçables | **fait** — `providers.py`, bascule locale → distante → cloud → mode système, imposée par les règles du dépôt |
| **Hermes hors du noyau** | travaille pour le Core | **fait** — appelé en HTTP `:8642`, interdiction explicite de le fusionner dans `core/` |
| **Rendu indépendant** | Holomat détachable | **fait** — le Core n'ouvre aucune caméra ; il reçoit ce que la couche d'incarnation rapporte |
| **Permissions graduées** | info < média < domotique < admin | **fait** — Policy Engine, gravité issue du catalogue |
| **Skills** | registre chargé par le Core | **partiel** — `deploy/hermes/skills/` contient six `SKILL.md`, mais ce sont des compétences **d'Hermes**. Aucun registre côté Core |
| **Device Manager** | déclaration + sélection | **embryon** — le Core ne connaît qu'un `dict[str, bool]` caméra/micro. L'arbitrage caméra (liste fermée de raisons, prise/relâchement) en est la première primitive |
| **Mission Control** | atelier d'évolution | **interface seule** — `MissionControlDev.tsx` existe ; aucune orchestration côté Core |
| **Evolution Lab / sandbox** | clone jetable | **inexistant** |
| **Agents développeurs** | Architecte → Dév → Test → Review → Déploiement | **inexistant** |

---

## 6. Evolution contrôlée

Le but n'est **pas** de laisser JARVIS modifier son noyau sans contrôle.

```
Demande → Mission Control → Sandbox → Clone virtuel → Développement
        → Tests → Validation → Sauvegarde → Déploiement → Rollback possible
```

Le clone n'a **ni secrets, ni accès au système critique**.

### Le vrai produit

L'inspiration retenue (agents développeurs coordonnés) tient en une phrase : le produit
n'est pas le code généré, c'est **le système qui coordonne les agents**.

```
Utilisateur → Direction → Orchestrateur → Agents → Code → Tests → Validation
```

---

## 7. Décisions ouvertes

### 7.1 L'ordre de construction

La note de vision place Mission Control et l'Evolution Lab avant Skills et Device
Manager. **Cette proposition inverse les deux étages**, pour une raison tirée des
défauts trouvés le 2026-08-04/05 :

| Défaut | Nature |
|---|---|
| séquences `auth`, `enrollment`, `unlock` jamais lancées | contrat déclaré, aucun appelant |
| micro : `voice/transcribe` déclaré sans un seul appel | contrat déclaré, aucun appelant |
| caméra : neuf `ensureCamera`, zéro `stopCamera` | acquisition sans symétrique |
| `enroll.name` / `enroll.profile` attendus, jamais émis | signal attendu, aucun émetteur |

Ces quatre défauts sont **le même défaut** : quelque chose est déclaré et jamais appelé,
et rien ne le signale. Un atelier qui laisse des agents ajouter des capacités par-dessus
cette base industrialiserait ce mode de panne.

Ce qui manque avant Mission Control n'est donc pas de la puissance, mais un moyen de
**prouver qu'une capacité est branchée**. Un registre de compétences vérifiant qu'un
contrat déclaré possède un appelant aurait fait tomber les quatre.

Le dépôt a déjà ce réflexe ailleurs : `hud/scripts/gen-ui-catalog.mjs --check` fait
échouer la CI quand le catalogue dérive de ses définitions. Le même principe appliqué
aux compétences ferait de Skills une fondation plutôt qu'une couche de plus.

**Ordre proposé** : Skills → Device Manager → Mission Control → Evolution Lab.

### 7.2 Frontière Skills Core / Skills Hermes

Deux notions portent aujourd'hui le même nom. Un `SKILL.md` d'Hermes est une consigne de
raisonnement ; une compétence du Core serait une capacité exécutable avec son contrat et
ses permissions. À trancher : deux registres distincts, ou un seul dont Hermes serait
consommateur ?

### 7.3 Sandbox — jusqu'où ?

Le clone virtuel sans secrets est clair. Ce qui ne l'est pas : a-t-il un HUD ? des
appareils simulés ? Peut-il parler ? Une sandbox sans voix ne teste pas ce qui casse le
plus souvent, et une sandbox qui parle risque de parler dans la vraie maison.

---

## 8. Ce que ce document ne dit pas

Il ne décrit **ni le protocole des compétences, ni le format de déclaration des
appareils, ni l'API de Mission Control**. Chacun mérite son propre contrat, écrit au
moment de le construire — comme [`JARVIS-Agentic-UI.md`](JARVIS-Agentic-UI.md) l'a fait
pour l'interface, après étude et avant code.
