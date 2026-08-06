#!/usr/bin/env bash
# Ajoute un appareil au tunnel WireGuard et sort sa configuration.
#
# Usage :
#   bash deploy/scripts/wg-add-peer.sh portable
#   bash deploy/scripts/wg-add-peer.sh telephone     # sort aussi un QR code
set -euo pipefail

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "Usage : $0 <nom-appareil>   (ex. portable, telephone)" >&2
  exit 1
fi

NUC="${NUC_SSH:-jarvis-nuc}"
WG_IF="wg0"
WG_NET="${WG_NET:-10.9.0}"
WG_PORT="${WG_PORT:-41820}"
ENDPOINT="${WG_ENDPOINT:-82.66.254.106}"   # IP WAN fixe de la Freebox
LAN_NET="192.168.1.0/24"

echo "==> Génération du pair « $NAME » sur le NUC"

# Tout se passe sur le NUC : la clé privée du client y est créée, insérée dans
# la configuration qu'on rapatrie, puis EFFACÉE. Elle n'existe qu'une fois, et
# c'est le fichier remis à l'appareil qui la porte.
#
# `wg set` applique le pair à chaud ET on l'écrit dans wg0.conf : sans
# l'écriture, le pair disparaîtrait au prochain redémarrage — une panne qui ne
# se voit que des semaines plus tard, loin de sa cause.
# shellcheck disable=SC2086
CLIENT_CONF=$(ssh $NUC "set -euo pipefail
  umask 077
  cd /etc/wireguard

  if grep -q '# peer: $NAME\$' $WG_IF.conf 2>/dev/null; then
    echo 'PAIR_EXISTE' >&2
    exit 3
  fi

  # Adresse libre suivante : on lit les pairs déjà déclarés au lieu de tenir un
  # compteur ailleurs — un compteur et un fichier finissent toujours par diverger.
  LAST=\$(grep -oE '$WG_NET\.[0-9]+' $WG_IF.conf 2>/dev/null | awk -F. '{print \$4}' | sort -n | tail -1)
  NEXT=\$(( \${LAST:-1} + 1 ))
  if [ \$NEXT -gt 254 ]; then echo 'PLUS_D_ADRESSE' >&2; exit 4; fi

  PRIV=\$(wg genkey)
  PUB=\$(printf '%s' \"\$PRIV\" | wg pubkey)
  PSK=\$(wg genpsk)

  cat >> $WG_IF.conf <<PEER

# peer: $NAME
[Peer]
PublicKey    = \$PUB
PresharedKey = \$PSK
AllowedIPs   = $WG_NET.\$NEXT/32
PEER

  wg set $WG_IF peer \"\$PUB\" preshared-key <(printf '%s' \"\$PSK\") allowed-ips $WG_NET.\$NEXT/32

  SERVER_PUB=\$(cat server.pub)
  GW=\$(ip route | awk '/^default/{print \$3; exit}')

  cat <<CLIENT
[Interface]
PrivateKey = \$PRIV
Address    = $WG_NET.\$NEXT/32
MTU        = 1420

# Résolveur du foyer. C'est LA ligne qui fait que jarvis.global-it-ss.com
# répond 192.168.1.37 depuis l'extérieur, exactement comme à la maison —
# un seul nom, un seul certificat, où qu'on soit.
DNS = \$GW

[Peer]
PublicKey    = \$SERVER_PUB
PresharedKey = \$PSK
Endpoint     = $ENDPOINT:$WG_PORT

# Tunnel PARTIEL, délibérément : seuls le réseau de la maison et celui du
# tunnel y passent. Router tout le trafic du téléphone par la maison viderait
# la batterie, ralentirait la navigation et ferait dépendre YouTube de la
# Freebox. On ne tunnelise que ce qui est chez soi.
AllowedIPs = $LAN_NET, $WG_NET.0/24

# Le client est derrière du NAT opérateur : sans trafic, la traduction expire
# et la maison ne peut plus le joindre. 25 s est la valeur éprouvée.
PersistentKeepalive = 25
CLIENT
")

OUT="wg-${NAME}.conf"
printf '%s\n' "$CLIENT_CONF" > "$OUT"
chmod 600 "$OUT" 2>/dev/null || true

echo
echo "Configuration écrite : $OUT"
echo

if command -v qrencode >/dev/null 2>&1; then
  qrencode -t ansiutf8 < "$OUT"
else
  # shellcheck disable=SC2086
  printf '%s\n' "$CLIENT_CONF" | ssh $NUC "qrencode -t ansiutf8" 2>/dev/null || {
    echo "(qrencode absent des deux côtés — importer le fichier à la main)"
  }
fi

cat <<EOF

────────────────────────────────────────────────────────────────────────
Téléphone  : application WireGuard → + → Scanner un QR code.
Portable   : WireGuard → Importer depuis un fichier → $OUT

⚠ Ce fichier porte la clé privée de l'appareil. Il n'est PAS versionné
  (cf. .gitignore). Le supprimer une fois importé.

Vérification, tunnel monté, depuis l'extérieur :
    curl -sS -o /dev/null -w '%{http_code}\\n' https://jarvis.global-it-ss.com/
────────────────────────────────────────────────────────────────────────
EOF
