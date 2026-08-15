#!/usr/bin/env bash
# Import Qwen cloned profiles + synth tests — VPS local Voicebox only.
set -euo pipefail

VB="${VOICEBOX_URL:-http://127.0.0.1:17600}"
DIR="$(cd "$(dirname "$0")" && pwd)"
REF="$DIR/references"
OUT="$DIR/output"
TRANSCRIPT="$(tr -d '\r' < "$DIR/reference_transcript.txt" | sed '/^$/d' | paste -sd ' ' -)"

mkdir -p "$OUT"

log() { echo "[$(date +%H:%M:%S)] $*"; }

wait_model() {
  local tries=0
  while [[ $tries -lt 60 ]]; do
    local st
    st=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$VB/generate/stream" \
      -H 'Content-Type: application/json' \
      -d '{"profile_id":"probe","text":"test","language":"fr","engine":"qwen"}' || true)
    if [[ "$st" != "202" ]]; then
      return 0
    fi
    log "modèle en téléchargement (HTTP 202) — attente 10s..."
    sleep 10
    tries=$((tries + 1))
  done
  return 1
}

create_profile() {
  local name="$1"
  local audio="$2"
  log "=== profil $name ==="
  local existing
  existing=$(curl -s "$VB/profiles" | python3 -c "
import json,sys
name=sys.argv[1]
for p in json.load(sys.stdin):
    if p.get('name')==name:
        print(p['id']); break
" "$name" 2>/dev/null || true)
  local pid
  if [[ -n "$existing" ]]; then
    log "profil existant $name id=$existing — skip création"
    pid="$existing"
  else
    pid=$(curl -s -X POST "$VB/profiles" \
      -H 'Content-Type: application/json' \
      -d "{\"name\":\"$name\",\"language\":\"fr\",\"voice_type\":\"cloned\",\"default_engine\":\"qwen\",\"description\":\"JARVIS OS clone test $name\"}" \
      | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
    log "créé id=$pid"
    curl -s -X POST "$VB/profiles/$pid/samples" \
      -F "file=@$audio" \
      -F "reference_text=$TRANSCRIPT" >/dev/null
    log "sample uploadé ($(basename "$audio"))"
  fi
  echo "$pid"
}

synth_timed() {
  local pid="$1" text="$2" engine="$3" out="$4" instruct="${5:-}"
  local payload
  if [[ -n "$instruct" ]]; then
    payload=$(python3 -c "import json,sys; print(json.dumps({'profile_id':sys.argv[1],'text':sys.argv[2],'language':'fr','engine':sys.argv[3],'personality':False,'instruct':sys.argv[4]}))" "$pid" "$text" "$engine" "$instruct")
  else
    payload=$(python3 -c "import json,sys; print(json.dumps({'profile_id':sys.argv[1],'text':sys.argv[2],'language':'fr','engine':sys.argv[3],'personality':False}))" "$pid" "$text" "$engine")
  fi
  local start end code
  start=$(date +%s.%N)
  code=$(curl -s -o "$out" -w '%{http_code}' -X POST "$VB/generate/stream" \
    -H 'Content-Type: application/json' \
    -d "$payload")
  end=$(date +%s.%N)
  local elapsed
  elapsed=$(python3 -c "print(f'{float('$end')-float('$start'):.2f}')")
  echo "$code $elapsed $(stat -c%s "$out" 2>/dev/null || echo 0)"
}

log "health: $(curl -s "$VB/health")"
docker stats voicebox --no-stream 2>/dev/null || true

PHRASE_J3="Le noyau répond correctement. J'effectue maintenant une vérification des services disponibles."
PHRASE_ALL="Analyse terminée. Les données sont cohérentes et aucune anomalie critique n'a été détectée."
INSTRUCT_JARVIS="Calm, composed and confident. Clear precise diction. Moderate conversational pace. Subtle dry wit. Professional futuristic butler. Never theatrical."

declare -A PIDS
for pair in "jarvis3:ref-jarvis3.mp3" "jarvis:ref-jarvis.mp3" "jarvis2:ref-jarvis2.mp3" "hermes:ref-hermes.mp3"; do
  name="${pair%%:*}"
  file="${pair##*:}"
  PIDS[$name]=$(create_profile "$name" "$REF/$file")
done

log "profiles: $(curl -s "$VB/profiles" | python3 -c 'import json,sys; d=json.load(sys.stdin); print([(p["name"],p["id"],p.get("voice_type"),p.get("default_engine")) for p in d])')"

log "--- TEST jarvis3 ---"
docker stats voicebox --no-stream 2>/dev/null || true
read -r code elapsed size <<< "$(synth_timed "${PIDS[jarvis3]}" "$PHRASE_J3" qwen "$OUT/voicebox-test-jarvis3.wav")"
log "jarvis3 synth HTTP=$code elapsed=${elapsed}s size=${size}b"
docker stats voicebox --no-stream 2>/dev/null || true

for name in jarvis jarvis2 hermes; do
  log "--- TEST $name ---"
  read -r code elapsed size <<< "$(synth_timed "${PIDS[$name]}" "$PHRASE_ALL" qwen "$OUT/voicebox-test-$name.wav")"
  log "$name synth HTTP=$code elapsed=${elapsed}s size=${size}b"
done

log "--- TEST jarvis3 instruct neutre vs stylé ---"
read -r code elapsed size <<< "$(synth_timed "${PIDS[jarvis3]}" "$PHRASE_J3" qwen "$OUT/voicebox-test-jarvis3-instruct-neutral.wav")"
log "instruct neutral HTTP=$code elapsed=${elapsed}s"
read -r code elapsed size <<< "$(synth_timed "${PIDS[jarvis3]}" "$PHRASE_J3" qwen "$OUT/voicebox-test-jarvis3-instruct-styled.wav" "$INSTRUCT_JARVIS")"
log "instruct styled HTTP=$code elapsed=${elapsed}s"

log "stockage profils:"
docker exec voicebox ls -laR /app/data/profiles 2>/dev/null | head -80 || true

log "DONE — outputs in $OUT"
