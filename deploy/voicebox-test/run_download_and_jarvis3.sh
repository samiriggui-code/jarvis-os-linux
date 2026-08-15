#!/usr/bin/env bash
set -euo pipefail
VB=http://127.0.0.1:17600
DIR=/tmp/voicebox-test
OUT=$DIR/output
PID=ac8c227f-14b3-49bf-9968-819af0e361b2
mkdir -p "$OUT"

log(){ echo "[$(date +%H:%M:%S)] $*"; }

log "trigger qwen 0.6B download via /generate"
resp=$(curl -s -w '\nHTTP:%{http_code}' -X POST "$VB/generate" \
  -H 'Content-Type: application/json' \
  -d "{\"profile_id\":\"$PID\",\"text\":\"Test.\",\"language\":\"fr\",\"engine\":\"qwen\",\"personality\":false,\"model_size\":\"0.6B\"}")
echo "$resp" | tail -5

log "poll /health until model_loaded"
for i in $(seq 1 180); do
  h=$(curl -s "$VB/health")
  loaded=$(echo "$h" | python3 -c "import json,sys; print(json.load(sys.stdin).get('model_loaded'))")
  downloaded=$(echo "$h" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('model_downloaded'), d.get('model_size'))")
  log "poll $i loaded=$loaded $downloaded"
  if [[ "$loaded" == "True" ]]; then break; fi
  sleep 10
done

curl -s "$VB/health" | python3 -m json.tool

TEXT="Le noyau répond correctement. J'effectue maintenant une vérification des services disponibles."
log "cold synth jarvis3"
docker stats voicebox --no-stream || true
start=$(date +%s.%N)
code=$(curl -s -o "$OUT/voicebox-test-jarvis3-cold.wav" -w '%{http_code}' -X POST "$VB/generate/stream" \
  -H 'Content-Type: application/json' \
  -d "{\"profile_id\":\"$PID\",\"text\":\"$TEXT\",\"language\":\"fr\",\"engine\":\"qwen\",\"personality\":false,\"model_size\":\"0.6B\"}")
end=$(date +%s.%N)
elapsed=$(python3 -c "print(f'{float('$end')-float('$start'):.2f}')")
size=$(stat -c%s "$OUT/voicebox-test-jarvis3-cold.wav" 2>/dev/null || echo 0)
log "cold HTTP=$code elapsed=${elapsed}s size=$size"
docker stats voicebox --no-stream || true

log "warm synth jarvis3"
start=$(date +%s.%N)
code=$(curl -s -o "$OUT/voicebox-test-jarvis3.wav" -w '%{http_code}' -X POST "$VB/generate/stream" \
  -H 'Content-Type: application/json' \
  -d "{\"profile_id\":\"$PID\",\"text\":\"$TEXT\",\"language\":\"fr\",\"engine\":\"qwen\",\"personality\":false,\"model_size\":\"0.6B\"}")
end=$(date +%s.%N)
elapsed=$(python3 -c "print(f'{float('$end')-float('$start'):.2f}')")
size=$(stat -c%s "$OUT/voicebox-test-jarvis3.wav" 2>/dev/null || echo 0)
log "warm HTTP=$code elapsed=${elapsed}s size=$size"
file "$OUT/voicebox-test-jarvis3.wav" || true
