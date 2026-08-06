#!/usr/bin/env bash
# Le seul test qui décide si l'accès LAN par nom public est praticable.
#
# ─── CE QU'ON CHERCHE ─────────────────────────────────────────────────────
#
# Toute l'architecture « maison » repose sur un nom public qui répond une
# adresse PRIVÉE : `jarvis.global-it-ss.com` → 192.168.1.37. C'est ce qui
# donne un certificat valide sur le LAN, donc la caméra et le micro, sans rien
# installer sur les appareils du foyer.
#
# Beaucoup de box filtrent exactement ça. La protection s'appelle *DNS
# rebinding* : le résolveur de la box efface les réponses pointant vers une
# plage privée, parce qu'un site malveillant pourrait s'en servir pour faire
# taper le navigateur d'un visiteur sur son propre réseau local. La protection
# est légitime — mais elle casse notre montage.
#
# ─── À LANCER DEPUIS LE WI-FI DE LA MAISON ────────────────────────────────
#
# Depuis un partage de connexion 4G, le test ne veut rien dire : il
# interrogerait le résolveur de l'opérateur, pas celui de la Freebox.
#
# ─── PRÉREQUIS : UN NOM DE TEST ───────────────────────────────────────────
#
# On ne teste PAS avec `jarvis.global-it-ss.com`, qui sert encore depuis le
# VPS. Créer d'abord chez Cloudflare, nuage GRIS (DNS only) :
#
#     test-lan.global-it-ss.com   A   192.168.1.37
#
# Il est jetable : une fois la décision prise, on le supprime.
#
# Usage :
#   bash deploy/scripts/check-dns-rebinding.sh
#   bash deploy/scripts/check-dns-rebinding.sh autre-nom.global-it-ss.com 192.168.1.37
set -uo pipefail

NAME="${1:-test-lan.global-it-ss.com}"
EXPECT="${2:-192.168.1.37}"

# `dig` d'abord, `nslookup` en repli : Git Bash sous Windows n'a souvent ni
# l'un ni l'autre, auquel cas on le dit franchement au lieu de rendre un
# résultat faux.
resolve() {  # resolve <nom> [serveur]
  local name="$1" server="${2:-}"
  if command -v dig >/dev/null 2>&1; then
    if [ -n "$server" ]; then dig +short +time=3 +tries=1 "$name" A "@$server" 2>/dev/null | grep -E '^[0-9.]+$' | head -1
    else                      dig +short +time=3 +tries=1 "$name" A          2>/dev/null | grep -E '^[0-9.]+$' | head -1; fi
  elif command -v nslookup >/dev/null 2>&1; then
    if [ -n "$server" ]; then nslookup "$name" "$server" 2>/dev/null | awk '/^Address/{a=$NF} END{print a}'
    else                      nslookup "$name"           2>/dev/null | awk '/^Address/{a=$NF} END{print a}'; fi
  else
    echo "__NO_TOOL__"
  fi
}

# Passerelle par défaut = la Freebox, dans la quasi-totalité des cas.
gateway() {
  ip route 2>/dev/null | awk '/^default/{print $3; exit}' && return
  powershell.exe -NoProfile -Command \
    "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).NextHop" \
    2>/dev/null | tr -d '\r\n '
}

GW="$(gateway)"
echo "Nom testé      : $NAME"
echo "Attendu        : $EXPECT"
echo "Passerelle     : ${GW:-(introuvable)}"
echo

# Garde-fou : le filtrage rebinding ne s'applique QU'AUX adresses privées. Un
# test mené avec une IP publique passerait toujours, et rendrait un « ✓
# praticable » qui ne prouve rien — le pire résultat possible, parce qu'on
# basculerait le DNS en confiance avant de découvrir le blocage.
case "$EXPECT" in
  10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*) ;;
  *)
    echo "✗ $EXPECT n'est pas une adresse privée." >&2
    echo "  Ce test n'a de sens que sur une plage privée (10/8, 172.16/12," >&2
    echo "  192.168/16) : c'est la seule que le filtrage vise. Créer d'abord" >&2
    echo "  test-lan.global-it-ss.com  A  192.168.1.37  (nuage GRIS)." >&2
    exit 2
    ;;
esac

# ── 1. Témoin : l'enregistrement est-il correct à la source ? ──────────────
# Sans ce contrôle, un enregistrement mal saisi se lirait comme un filtrage de
# la Freebox, et on partirait réparer la mauvaise chose.
PUBLIC="$(resolve "$NAME" 1.1.1.1)"
if [ "$PUBLIC" = "__NO_TOOL__" ]; then
  echo "Ni dig ni nslookup — test impossible depuis ce shell." >&2
  echo "Lancer depuis le NUC, ou installer dnsutils." >&2
  exit 2
fi
echo "1. Cloudflare (1.1.1.1)  -> ${PUBLIC:-(rien)}"
if [ "$PUBLIC" != "$EXPECT" ]; then
  echo
  echo "   ✗ L'enregistrement lui-même ne répond pas $EXPECT."
  echo "     Vérifier chez Cloudflare : type A, nuage GRIS (DNS only)."
  echo "     Une entrée proxifiée renverrait une IP de Cloudflare — et une IP"
  echo "     privée ne PEUT pas être proxifiée, le nuage doit être gris."
  exit 1
fi

# ── 2. Le résolveur de la Freebox ─────────────────────────────────────────
BOX="$(resolve "$NAME" "${GW:-192.168.1.254}")"
echo "2. Freebox (${GW:-192.168.1.254})   -> ${BOX:-(rien)}"

# ── 3. Le résolveur réellement utilisé par cette machine ──────────────────
SYS="$(resolve "$NAME")"
echo "3. Résolveur système     -> ${SYS:-(rien)}"
echo

# ── Verdict ───────────────────────────────────────────────────────────────
if [ "$BOX" = "$EXPECT" ] && [ "$SYS" = "$EXPECT" ]; then
  cat <<'EOF'
✓ PRATICABLE — aucun filtrage.

La Freebox laisse passer une réponse en adresse privée. Le montage « maison »
fonctionne tel quel : bascule de l'enregistrement A et c'est fini. Rien à
configurer sur les tablettes.
EOF
  exit 0
fi

cat <<EOF
✗ FILTRAGE ACTIF — la Freebox efface la réponse privée.

Ce n'est pas bloquant, mais il faut déclarer le nom localement. Deux sorties,
par ordre de préférence :

  A. Bail DHCP statique + nom d'hôte sur la Freebox
     Freebox OS → Paramètres de la Freebox → DHCP → Baux statiques.
     Donner l'IP 192.168.1.37 au NUC et le nommer. La Freebox répond alors
     elle-même pour ce nom, sans passer par l'extérieur.

  B. Résolveur local sur le NUC (dnsmasq), distribué par DHCP
     Plus de maîtrise, une brique de plus à maintenir.

Et un bénéfice inattendu, qui vaut d'être noté : avec un nom résolu
LOCALEMENT, le HUD de la maison continue de fonctionner même Internet coupé.
Avec le seul DNS public, une panne de box côté WAN rendrait l'écran mural
injoignable alors que le NUC tourne à trois mètres. La sortie A n'est donc pas
un contournement — c'est la bonne conception pour un appareil domestique.
EOF
exit 1
