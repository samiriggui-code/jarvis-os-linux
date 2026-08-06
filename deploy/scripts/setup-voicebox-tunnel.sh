#!/usr/bin/env bash
# Crée la clé dédiée voicebox (NUC), l'inscrit bornée sur le VPS (port 17600),
# active jarvis-tunnel-voicebox.service.
set -euo pipefail

ROOT="/mnt/c/laragon/www/jarvis-os-linux"
# LAN (jarvis-nuc) ou WAN si LAN down : NUC_SSH='-p 41222 root@82.66.254.106'
NUC="${NUC_SSH:-jarvis-nuc}"
VPS_HOST="187.77.166.124"
KEY="/root/.ssh/jarvis_vps_voicebox_ed25519"
COMMENT="jarvis-nuc-voicebox-tunnel-only"

echo "==> 1. Clé sur le NUC ($NUC)"
ssh $NUC "umask 077
if [ ! -f $KEY ]; then
  ssh-keygen -t ed25519 -f $KEY -N '' -C '$COMMENT'
  echo KEY_CREATED
else
  echo KEY_EXISTS
fi
chmod 600 $KEY; chmod 644 ${KEY}.pub"

echo "==> 2. Publique → fichier local"
ssh $NUC "cat ${KEY}.pub" > /tmp/jarvis_vb.pub
PUB=$(tr -d '\r\n' < /tmp/jarvis_vb.pub)
echo "PUB_LEN=${#PUB}"

echo "==> 3. authorized_keys VPS (bornée 17600)"
# Ligne via base64 : évite que PowerShell / ssh mangent les guillemets
# permitopen="…" / command="…" (obligatoires, cf. clé ollama).
LINE="restrict,port-forwarding,permitopen=\"127.0.0.1:17600\",command=\"/bin/false\" ${PUB}"
B64=$(printf '%s' "$LINE" | base64 -w0 2>/dev/null || printf '%s' "$LINE" | base64)
ssh -o BatchMode=yes -o ConnectTimeout=15 "root@${VPS_HOST}" \
  "grep -v '$COMMENT' /root/.ssh/authorized_keys > /tmp/ak.tmp 2>/dev/null || true
   mv /tmp/ak.tmp /root/.ssh/authorized_keys
   echo '$B64' | base64 -d >> /root/.ssh/authorized_keys
   echo >> /root/.ssh/authorized_keys
   chmod 600 /root/.ssh/authorized_keys
   grep -c '$COMMENT' /root/.ssh/authorized_keys"

echo "==> 4. known_hosts + unit systemd"
ssh-keyscan -H "$VPS_HOST" 2>/dev/null | ssh $NUC "cat >> /root/.ssh/known_hosts"
ssh $NUC "cat > /etc/systemd/system/jarvis-tunnel-voicebox.service" \
  < "$ROOT/deploy/systemd/jarvis-tunnel-voicebox.service"

echo "==> 5. Activer le tunnel + relancer Core"
ssh $NUC "systemctl daemon-reload
systemctl enable --now jarvis-tunnel-voicebox.service
sleep 4
echo TUNNEL:\$(systemctl is-active jarvis-tunnel-voicebox)
ss -lntp | grep 17600 || echo 'PORT_17600_ABSENT'
curl -s -m 8 -o /dev/null -w 'voicebox:%{http_code}\n' http://127.0.0.1:17600/ || true
systemctl restart jarvis-core.service
sleep 6
journalctl -u jarvis-core -n 25 --no-pager | grep -iE 'voice|voicebox|Auth prêt|WS' | tail -12"

rm -f /tmp/jarvis_vb.pub
echo "==> DONE"
