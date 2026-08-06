# JARVIS Accès réseau — contrat d'architecture

> **La maison n'a pas besoin d'Internet pour se parler à elle-même.**
> Le foyer joint le NUC en direct, sans rien installer. L'extérieur, c'est une
> personne et deux appareils.
>
> Écrit le 2026-08-06. Documents liés :
> [`JARVIS-Satellites.md`](JARVIS-Satellites.md) (les appareils du foyer sont
> des satellites) et [`../DECISIONS.md`](../DECISIONS.md).

---

## 1. Le problème

Trois chemins d'accès ont été construits en trois jours, et aucun n'a été
retiré :

| Chemin | État au 2026-08-06 | Pour qui |
|---|---|---|
| VPS + FQDN public + tunnel SSH inverse | en service | tout le monde |
| Twingate | provisionné, jetons en place | tout le monde |
| SSH WAN (41222 / 41223) | en service | Samir |

Ils répondent tous à la même question et se contredisent. Twingate n'a de sens
que si rien n'est public — or le HUD est public. On paie donc la complexité des
trois, et on n'a la propriété de sécurité d'aucun.

Ce n'est pas un défaut d'implémentation : c'est une décision qui n'a jamais été
prise.

### Ce que la mesure a montré

| Tronçon | Coût | Payé |
|---|---|---|
| Core sur le NUC (handshake WS) | 1,5–2,8 ms | par message |
| nginx local sur le NUC | 0,6 ms | par message |
| Poste → VPS | ~40 ms | par aller-retour |
| VPS → tunnel SSH → NUC → retour | ~46 ms | par aller-retour |
| Poignée de main TLS | ~110 ms | une seule fois |

**Le Core consomme 2 ms sur 86.** Il n'y a rien à optimiser dans le code : tout
le délai est du trajet. Les paquets d'une tablette posée à trois mètres du NUC
vont jusqu'à un datacenter et reviennent.

⚠ À ne pas confondre avec le sujet voisin : ces 86 ms ne sont **pas** ce qui
rend l'enrôlement inerte. Ça, ce sont les timeouts de 15, 20 et 25 s des étapes
qui attendent `enroll.voice`, `face.landmarks` et `face.model` — des signaux
sans émetteur. Même à latence nulle, le vide serait le même.

---

## 2. Pourquoi Twingate est écarté

Twingate est conçu pour du télétravail d'entreprise : un client par appareil,
un compte par personne, des mises à jour à suivre.

Le foyer, c'est la tablette murale, les tablettes des filles, le téléphone de
sa femme, le sien, et un invité qui passe. **Le coût d'installation se
multiplie par le nombre d'habitants, et il est payé à nouveau à chaque nouvel
appareil.** Pour un invité, il est carrément rédhibitoire.

Ce n'est pas un mauvais produit, c'est le mauvais problème.

---

## 3. La décision

**Deux populations, deux chemins, un seul nom.**

### 3.1 Le foyer — LAN direct, nom public, adresse privée

`jarvis.global-it-ss.com` → `192.168.1.37`, chez Cloudflare en **DNS only**
(nuage gris : une adresse privée ne peut pas être proxifiée).

Certificat Let's Encrypt émis par **challenge DNS-01**. Le point décisif : la
validation se fait par un enregistrement TXT, donc aucun port n'est ouvert, et
rien n'interdit à un nom public de désigner une adresse privée.

Ce qu'on obtient : les appareils du foyer ouvrent une URL. Rien à installer,
aucun compte, aucune mise à jour. Certificat valide donc **contexte sécurisé**,
donc `getUserMedia` fonctionne — c'est ce qui conditionne la caméra et le micro,
et donc tout l'enrôlement. Latence LAN, de l'ordre de la milliseconde.

### 3.2 L'extérieur — WireGuard en direct sur le NUC

Un port UDP redirigé par la Freebox. Pas de relais par le VPS : ce serait
réintroduire les 46 ms et remettre Hostinger sur le chemin critique de la
maison.

**Un seul utilisateur, deux appareils.** Le coût d'installation ne se multiplie
plus par le nombre d'habitants — c'est toute la différence avec Twingate.

### 3.3 Ce qui unifie les deux

Tunnel monté, **le client est sur le réseau de la maison**. `jarvis.global-it-ss.com`
y répond `192.168.1.37` exactement comme depuis le salon, à condition que la
configuration client pousse le résolveur du foyer — ce que fait
[`wg-add-peer.sh`](../../deploy/scripts/wg-add-peer.sh).

Un nom. Un certificat. Un vhost. **Le HUD n'a jamais à savoir d'où il est
ouvert** : `coreClient.ts` dérive déjà `wss://<host>/ws` de l'origine de la
page. Aucune variable d'environnement selon le lieu, aucun second hôte
« externe » à maintenir.

---

## 4. Ce que ça change

| | Avant | Après |
|---|---|---|
| Famille à la maison | via VPS, ~86 ms | direct LAN, ~1 ms |
| Samir dehors | via VPS, ~86 ms | WireGuard, ~40 ms |
| À installer chez les habitants | — | **rien** |
| Exposé sur Internet | HUD + Core WS, sans auth au bord | **rien** |
| Dépendance Hostinger | critique | supprimée |
| Ports ouverts au domicile | 2 × SSH (bavards) | 1 × WireGuard (muet) |

Le VPS reste en service pour **voicebox et Ollama**, qui n'ont rien à voir avec
l'accès au HUD.

### Sur les ports ouverts

Ouvrir WireGuard fait *gagner* de la surface d'attaque. Un port UDP WireGuard
ne répond rien à un paquet non authentifié : un scanner ne voit ni un port
fermé, ni un port filtré — rien. Les deux ports SSH actuels, eux, annoncent
leur bannière à qui demande. Une fois le tunnel éprouvé, ils rentrent derrière
lui.

---

## 5. Les deux risques, et pourquoi le second commande la conception

**Le filtrage *DNS rebinding*.** Beaucoup de box effacent une réponse publique
pointant vers une plage privée — protection légitime, qui casse ce montage.
Testable en une commande :
[`check-dns-rebinding.sh`](../../deploy/scripts/check-dns-rebinding.sh).

**La dépendance à Internet pour se parler à soi-même.** Celui-là est plus grave
et il n'était pas dans l'analyse initiale : si le nom n'est résolu que par le
DNS public, **une panne de WAN rend le HUD injoignable à l'intérieur de la
maison**, alors que le NUC tourne à trois mètres et que tout fonctionne. Pour un
appareil domestique c'est inacceptable — le cahier des charges §11 pose que
JARVIS BASE survit à la perte de n'importe quel module.

Déclarer le nom dans le DNS de la Freebox (bail statique + nom d'hôte) n'est
donc pas un contournement du premier risque. **C'est la bonne conception, et
elle règle les deux.**

Reste une fuite mineure et assumée : l'adresse interne du NUC devient lisible
dans le DNS public.

---

## 6. Ordre de réalisation

Chaque étape est utile seule, et aucune ne casse la précédente.

| # | Étape | Qui | Bloquant pour |
|---|---|---|---|
| 1 | Bail DHCP statique `192.168.1.37` pour le NUC (Freebox OS) | **Samir** | tout le reste |
| 2 | Test du rebinding depuis le Wi-Fi maison | **Samir** | choix du DNS local |
| 3 | Jeton Cloudflare « Edit zone DNS », limité à `global-it-ss.com` | **Samir** | étape 4 |
| 4 | Certificat DNS-01 + vhost 443 (`setup-lan-tls.sh`) | automatisé | — |
| 5 | **Bascule DNS** : `187.77.166.124` → `192.168.1.37` | **Samir** | — |
| 6 | WireGuard serveur + port UDP Freebox | mixte | étape 7 |
| 7 | Pairs portable et téléphone (`wg-add-peer.sh`) | automatisé | — |
| 8 | Retrait du tunnel inverse VPS et du vhost 8080 | automatisé | — |

**À l'étape 4, la maison marche déjà** — c'est l'essentiel du bénéfice pour la
moitié du travail. WireGuard vient ensuite, tranquillement, puisqu'il ne
concerne qu'une personne.

⚠ Ne pas faire l'étape 8 avant d'avoir vécu une semaine sans le VPS.

### Ce qui casse à l'étape 5, et c'est voulu

`jarvis.global-it-ss.com` cesse d'être joignable depuis Internet. C'est
l'objectif, pas un effet de bord. Le certificat étant émis par DNS-01, il est
en place **avant** la bascule : il n'y a pas de fenêtre sans TLS.

---

## 7. Décisions ouvertes

1. **Le vhost `:8080`** — le garder en secours après l'étape 8, ou le retirer ?
   Il ne sert plus qu'au tunnel inverse.
2. **Les ports SSH 41222 / 41223** — les fermer une fois WireGuard éprouvé ?
   Recommandé, mais c'est aussi la porte de secours si le tunnel tombe.
3. **Le nom `jarvis` vs un second nom** — un seul nom pour l'intérieur et
   l'extérieur suppose que la bascule est définitive. Un `pub.` séparé
   permettrait de montrer le HUD à quelqu'un sans client, au prix d'une
   exposition permanente.
