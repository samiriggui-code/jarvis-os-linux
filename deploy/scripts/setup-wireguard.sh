#!/usr/bin/env bash
# WireGuard sur le NUC — accès depuis l'extérieur, pour Samir seul.
#
# ─── CE QUE ÇA RÉSOUT, ET CE QUE ÇA NE RÉSOUT PAS ─────────────────────────
#
# Ça ne concerne PAS le foyer. Les tablettes, les téléphones de la maison et
# la tablette murale passent par le LAN, sans rien installer — c'est tout
# l'objet du montage `jarvis-lan.conf`. WireGuard ne sert qu'à une personne,
# depuis dehors, sur deux appareils. C'est ce qui le distingue de Twingate,
# écarté précisément parce qu'il imposait un client à chaque habitant.
#
# ─── LA PROPRIÉTÉ QUI FAIT TOUT TENIR ─────────────────────────────────────
#
# Une fois le tunnel monté, le client EST sur le réseau de la maison. Donc
# `jarvis.global-it-ss.com` y répond 192.168.1.37 exactement comme depuis le
# salon — à condition de pousser le résolveur du foyer, ce que fait ce script.
#
# Conséquence : UN seul nom, UN seul certificat, UN seul vhost, et le HUD
# n'a jamais à savoir d'où il est ouvert. Pas de `VITE_CORE_WS_URL` à changer
# selon le lieu, pas de second hôte « externe » à maintenir.
#
# ─── POURQUOI EN DIRECT ET PAS PAR LE VPS ─────────────────────────────────
#
# Relayer par Hostinger ferait revenir le détour mesuré à ~46 ms et remettrait
# un tiers sur le chemin critique de la maison. En direct : un aller-retour,
# ~40 ms vers le WAN Freebox — le minimum atteignable depuis l'extérieur.
#
# Sur la sécurité, ouvrir WireGuard fait GAGNER de la surface, pas en perdre :
# un port UDP WireGuard ne répond rien à un paquet non authentifié. Un
# scanner ne voit pas un port fermé, pas un port filtré — rien du tout. Les
# deux ports SSH aujourd'hui exposés (41222, 41223), eux, annoncent leur
# bannière à qui demande. Le jour où le tunnel est éprouvé, ils peuvent
# rentrer derrière lui.
#
# Usage :
#   bash deploy/scripts/setup-wireguard.sh
set -euo pipefail

NUC="${NUC_SSH:-jarvis-nuc}"
WG_PORT="${WG_PORT:-41820}"     # cohérent avec 41222 / 41223 côté SSH
WG_NET="${WG_NET:-10.9.0}"      # ni 192.168.1.x (LAN) ni 172.17.x (docker)
WG_IF="wg0"

echo "==> 1. Outils WireGuard"
# Le module noyau est déjà présent sur Ubuntu 26.04 (vérifié : wireguard.ko).
# Seuls `wg` et `wg-quick` manquent.
# shellcheck disable=SC2086
ssh $NUC "DEBIAN_FRONTEND=noninteractive apt-get update -qq
          DEBIAN_FRONTEND=noninteractive apt-get install -y -qq wireguard qrencode
          wg --version"

echo "==> 2. Clés du serveur (générées SUR le NUC, jamais transportées)"
# La clé privée ne quitte pas la machine : elle n'est ni affichée, ni copiée
# ici. Un secret qui transite par un shell finit dans un historique.
# shellcheck disable=SC2086
ssh $NUC "umask 077
  mkdir -p /etc/wireguard
  if [ ! -f /etc/wireguard/server.key ]; then
    wg genkey | tee /etc/wireguard/server.key | wg pubkey > /etc/wireguard/server.pub
    echo 'CLES_CREEES'
  else
    echo 'CLES_EXISTANTES'
  fi
  chmod 600 /etc/wireguard/server.key"

echo "==> 3. Interface $WG_IF"
# shellcheck disable=SC2086
ssh $NUC "test -f /etc/wireguard/$WG_IF.conf && echo 'CONF_EXISTE — pairs préservés' || {
  LAN_IF=\$(ip route | awk '/^default/{print \$5; exit}')
  umask 077
  cat > /etc/wireguard/$WG_IF.conf <<CONF
# Généré par deploy/scripts/setup-wireguard.sh — les [Peer] sont ajoutés par
# wg-add-peer.sh. Ne pas réécrire ce fichier à la main sans les recopier.
[Interface]
Address    = $WG_NET.1/24
ListenPort = $WG_PORT
PostUp     = wg set %i private-key /etc/wireguard/server.key

# MTU : le piège classique. WireGuard encapsule, et une valeur trop haute
# donne des symptômes trompeurs — des pages qui se chargent à moitié, des
# WebSockets qui gèlent sans message d'erreur. 1420 passe partout.
MTU = 1420

# Masquerade : le client sort avec l'adresse du NUC sur le LAN. Sans cela il
# faudrait apprendre à la Freebox la route de retour vers $WG_NET.0/24, ce
# qu'on ne peut pas faire proprement depuis Freebox OS. Effet de bord assumé :
# le Core voit ces connexions arriver de 192.168.1.37.
PostUp   = iptables -t nat -A POSTROUTING -s $WG_NET.0/24 -o \$LAN_IF -j MASQUERADE
PostDown = iptables -t nat -D POSTROUTING -s $WG_NET.0/24 -o \$LAN_IF -j MASQUERADE
CONF
  chmod 600 /etc/wireguard/$WG_IF.conf
  echo 'CONF_CREEE'
}"

echo "==> 4. Activation"
# shellcheck disable=SC2086
ssh $NUC "systemctl enable --now wg-quick@$WG_IF
  systemctl is-active wg-quick@$WG_IF
  wg show $WG_IF | head -5"

echo "==> 5. Empreinte publique du serveur"
# shellcheck disable=SC2086
ssh $NUC "cat /etc/wireguard/server.pub"

cat <<EOF

────────────────────────────────────────────────────────────────────────
Serveur prêt, aucun pair déclaré.

Étape MANUELLE, sur Freebox OS → Paramètres → Gestion des ports :

    UDP  $WG_PORT  ->  192.168.1.37 : $WG_PORT

C'est le seul port à ouvrir, et il est muet : sans clé valide, il ne
répond rien du tout.

Puis, pour chaque appareil (portable, téléphone) :

    bash deploy/scripts/wg-add-peer.sh portable
    bash deploy/scripts/wg-add-peer.sh telephone

Le second sort un QR code à scanner depuis l'application WireGuard.
────────────────────────────────────────────────────────────────────────
EOF
