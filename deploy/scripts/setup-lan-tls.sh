#!/usr/bin/env bash
# Certificat Let's Encrypt pour `jarvis.global-it-ss.com` sur le NUC, émis par
# challenge DNS-01 chez Cloudflare, puis installation du vhost HTTPS.
#
# ─── POURQUOI DNS-01 ET PAS HTTP-01 ───────────────────────────────────────
#
# HTTP-01 exige que Let's Encrypt joigne le NUC sur le port 80 depuis
# Internet : il faudrait ouvrir un port sur la Freebox, ce que toute cette
# architecture cherche justement à éviter.
#
# DNS-01 valide par un enregistrement TXT. Conséquences, et elles sont
# décisives ici :
#
#   · aucun port ouvert, jamais ;
#   · le certificat peut être émis AVANT que le nom pointe sur le NUC. On
#     prépare donc tout pendant que `jarvis.global-it-ss.com` sert encore
#     depuis le VPS, et la bascule DNS se fait en dernier, sans coupure ;
#   · un nom peut légitimement pointer vers une adresse privée. C'est ce qui
#     donne un certificat valide sur 192.168.1.37, donc `getUserMedia`, donc
#     la caméra et le micro sur les tablettes du foyer.
#
# ─── LE JETON ─────────────────────────────────────────────────────────────
#
# À créer sur https://dash.cloudflare.com/profile/api-tokens avec le modèle
# « Edit zone DNS », restreint à la SEULE zone `global-it-ss.com`. Un jeton
# global donnerait à ce NUC le pouvoir de modifier tous tes domaines ; celui-ci
# ne peut toucher qu'une zone, et n'y écrit que des TXT `_acme-challenge`.
#
# Il n'est JAMAIS écrit dans le dépôt : il se passe par l'environnement, et
# atterrit sur le NUC en 600, hors du dépôt.
#
# Usage :
#   CF_API_TOKEN='…' bash deploy/scripts/setup-lan-tls.sh
#   CF_API_TOKEN='…' NUC_SSH='-p 41222 -i ~/.ssh/jarvis_nuc_ed25519 root@82.66.254.106' \
#     bash deploy/scripts/setup-lan-tls.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NUC="${NUC_SSH:-jarvis-nuc}"
FQDN="${JARVIS_FQDN:-jarvis.global-it-ss.com}"
EMAIL="${LE_EMAIL:-samiriggui@gmail.com}"
CRED="/root/.secrets/cloudflare.ini"

if [ -z "${CF_API_TOKEN:-}" ]; then
  echo "ERREUR : CF_API_TOKEN absent." >&2
  echo "  Jeton Cloudflare « Edit zone DNS » limité à global-it-ss.com." >&2
  echo "  CF_API_TOKEN='…' bash $0" >&2
  exit 1
fi

echo "==> 1. certbot + plugin Cloudflare sur le NUC ($NUC)"
# shellcheck disable=SC2086
ssh $NUC "DEBIAN_FRONTEND=noninteractive apt-get update -qq
          DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
            certbot python3-certbot-dns-cloudflare
          certbot --version"

echo "==> 2. Jeton déposé en 600, hors dépôt"
# Passé sur stdin et non en argument : un secret sur la ligne de commande est
# visible dans `ps` de tout utilisateur de la machine le temps de l'exécution.
# shellcheck disable=SC2086
printf 'dns_cloudflare_api_token = %s\n' "$CF_API_TOKEN" | ssh $NUC "
  umask 077
  mkdir -p /root/.secrets
  cat > $CRED
  chmod 600 $CRED
  echo 'credentials posées'"

echo "==> 3. Émission du certificat pour $FQDN"
# `--dns-cloudflare-propagation-seconds` : Cloudflare publie vite, mais Let's
# Encrypt interroge des résolveurs répartis dans le monde. Trop court, la
# validation échoue par intermittence — et un échec ACME répété finit par
# taper les quotas. Trente secondes est le compromis usuel.
# shellcheck disable=SC2086
ssh $NUC "certbot certonly \
    --non-interactive --agree-tos --email '$EMAIL' \
    --dns-cloudflare \
    --dns-cloudflare-credentials $CRED \
    --dns-cloudflare-propagation-seconds 30 \
    -d '$FQDN' \
    --cert-name '$FQDN'"

echo "==> 4. Vhost HTTPS"
# shellcheck disable=SC2086
ssh $NUC "cat > /etc/nginx/conf.d/jarvis-lan.conf" < "$ROOT/deploy/nginx/jarvis-lan.conf"

echo "==> 5. Rechargement nginx (test de conf d'abord)"
# `nginx -t` avant tout : une conf invalide qui passe en `reload` laisse nginx
# tourner sur l'ancienne, et on croit avoir déployé.
# shellcheck disable=SC2086
ssh $NUC "nginx -t && systemctl reload nginx && systemctl is-active nginx"

echo "==> 6. Renouvellement automatique"
# Le paquet Debian pose déjà `certbot.timer`. On vérifie qu'il tourne, et on
# branche le rechargement de nginx : un certificat renouvelé qu'nginx ne relit
# jamais expire quand même du point de vue des navigateurs.
# shellcheck disable=SC2086
ssh $NUC "systemctl enable --now certbot.timer >/dev/null 2>&1 || true
  mkdir -p /etc/letsencrypt/renewal-hooks/deploy
  cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/bin/sh
systemctl reload nginx
HOOK
  chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
  systemctl is-active certbot.timer || true
  certbot renew --dry-run --cert-name '$FQDN' 2>&1 | tail -5"

echo
echo "==> 7. Vérification locale sur le NUC"
# Le nom ne pointe pas encore sur le NUC : on force la résolution pour tester
# le vhost tel qu'il répondra après la bascule.
# shellcheck disable=SC2086
ssh $NUC "curl -sS -o /dev/null -w 'HTTPS local -> %{http_code} (cert: %{ssl_verify_result})\n' \
    --resolve '$FQDN:443:127.0.0.1' 'https://$FQDN/'"

cat <<EOF

────────────────────────────────────────────────────────────────────────
Certificat en place. Le nom pointe ENCORE sur le VPS — rien n'a changé
pour les utilisateurs.

Il reste, dans cet ordre :

  1. Réserver 192.168.1.37 pour le NUC dans le DHCP de la Freebox.
     Sans ça, l'adresse peut changer et l'enregistrement DNS pointera
     dans le vide.

  2. Tester le filtrage rebinding depuis le Wi-Fi de la maison :
     bash deploy/scripts/check-dns-rebinding.sh

  3. Basculer l'enregistrement A de $FQDN :
     187.77.166.124  ->  192.168.1.37
     Cloudflare, nuage GRIS (DNS only) — une IP privée ne se proxifie pas.

À la bascule, l'accès public disparaît : c'est l'objectif, pas un effet
de bord. Le VPS reste utile pour voicebox et Ollama.
────────────────────────────────────────────────────────────────────────
EOF
