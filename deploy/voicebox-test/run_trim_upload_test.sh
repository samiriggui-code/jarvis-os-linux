#!/usr/bin/env bash
# Trim references to 29s (Voicebox/Qwen max 30s) + upload samples + synth tests.
set -euo pipefail

VB="${VOICEBOX_URL:-http://127.0.0.1:17600}"
DIR="$(cd "$(dirname "$0")" && pwd)"
REF="$DIR/references"
NORM="$DIR/normalized"
OUT="$DIR/output"
TRANSCRIPT="$(tr -d '\r' < "$DIR/reference_transcript_29s.txt" | sed '/^$/d' | paste -sd ' ' -)"

mkdir -p "$NORM" "$OUT"

log() { echo "[$(date +%H:%M:%S)] $*"; }

trim_all() {
  for mp3 in "$REF"/ref-*.mp3; do
    base=$(basename "$mp3" .mp3)
    out="$NORM/${base}-29s.wav"
    ffmpeg -y -hide_banner -loglevel error -i "$mp3" -t 29 -ac 1 -ar 24000 "$out"
    dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out")
    log "trim $base -> ${dur}s mono 24kHz $(stat -c%s "$out") bytes"
  done
}

upload_sample() {
  local name="$1" wav="$2"
  local pid
  pid=$(curl -s "$VB/profiles" | python3 -c "
import json,sys
name=sys.argv[1]
for p in json.load(sys.stdin):
    if p.get('name')==name:
        print(p['id']); break
" "$name")
  [[ -n "$pid" ]] || { log "profil $name introuvable"; return 1; }
  local resp code
  resp=$(curl -s -w '\nHTTP:%{http_code}' -X POST "$VB/profiles/$pid/samples" \
    -F "file=@$wav" \
    -F "reference_text=$TRANSCRIPT")
  code=$(echo "$resp" | tail -1 | cut -d: -f2)
  body=$(echo "$resp" | sed '$d')
  log "upload $name sample HTTP=$code body=$body"
  [[ "$code" == "200" ]]
}

synth_timed() {
  local pid="$1" text="$2" engine="$3" out="$4" instruct="${5:-}"
  local payload
  if [[ -n "$instruct" ]]; then
    payload=$(python3 -c "import json,sys; print(json.dumps({'profile_id':sys.argv[1],'text':sys.argv[2],'language':'fr','engine':sys.argv[3],'personality':False,'instruct':sys.argv[4],'model_size':'0.6B'}))" "$pid" "$text" "$engine" "$instruct")
  else
    payload=$(python3 -c "import json,sys; print(json.dumps({'profile_id':sys.argv[1],'text':sys.argv[2],'language':'fr','engine':sys.argv[3],'personality':False,'model_size':'0.6B'}))" "$pid" "$text" "$engine")
  fi
  local start end code
  start=$(date +%s.%N)
  code=$(curl -s -o "$out" -w '%{http_code}' -X POST "$VB/generate/stream" \
    -H 'Content-Type: application/json' \
    -d "$payload")
  end=$(date +%s.%N)
  local elapsed size
  elapsed=$(python3 -c "print(f'{float('$end')-float('$start'):.2f}')")
  size=$(stat -c%s "$out" 2>/dev/null || echo 0)
  echo "$code $elapsed $size"
}

trim_all

for pair in "jarvis3:ref-jarvis3-29s.wav" "jarvis:ref-jarvis-29s.wav" "jarvis2:ref-jarvis2-29s.wav" "hermes:ref-hermes-29s.wav"; do
  name="${pair%%:*}"
  wav="${pair##*:}"
  upload_sample "$name" "$NORM/$wav"
done

log "profiles post-upload:"
curl -s "$VB/profiles" | python3 -c 'import json,sys; [print(p["name"], p["id"], "samples=", p.get("sample_count")) for p in json.load(sys.stdin)]'

declare -A PIDS
while read -r name pid sc; do PIDS[$name]=$pid; done < <(curl -s "$VB/profiles" | python3 -c 'import json,sys
for p in json.load(sys.stdin): print(p["name"], p["id"], p.get("sample_count",0))')

PHRASE_J3="Le noyau répond correctement. J'effectue maintenant une vérification des services disponibles."
PHRASE_ALL="Analyse terminée. Les données sont cohérentes et aucune anomalie critique n'a été détectée."
INSTRUCT="Calm, composed and confident. Clear precise diction. Moderate conversational pace. Subtle dry wit. Professional futuristic butler. Never theatrical."

log "--- jarvis3 cold/warm ---"
docker stats voicebox --no-stream 2>/dev/null || true
read -r c e s <<< "$(synth_timed "${PIDS[jarvis3]}" "$PHRASE_J3" qwen "$OUT/voicebox-test-jarvis3-cold.wav")"
log "jarvis3 cold HTTP=$c elapsed=${e}s size=$s"
docker stats voicebox --no-stream 2>/dev/null || true
read -r c e s <<< "$(synth_timed "${PIDS[jarvis3]}" "$PHRASE_J3" qwen "$OUT/voicebox-test-jarvis3.wav")"
log "jarvis3 warm HTTP=$c elapsed=${e}s size=$s"

for name in jarvis jarvis2 hermes; do
  read -r c e s <<< "$(synth_timed "${PIDS[$name]}" "$PHRASE_ALL" qwen "$OUT/voicebox-test-$name.wav")"
  log "$name HTTP=$c elapsed=${e}s size=$s"
done

read -r c e s <<< "$(synth_timed "${PIDS[jarvis3]}" "$PHRASE_J3" qwen "$OUT/voicebox-test-jarvis3-instruct-neutral.wav")"
log "instruct neutral HTTP=$c elapsed=${e}s"
read -r c e s <<< "$(synth_timed "${PIDS[jarvis3]}" "$PHRASE_J3" qwen "$OUT/voicebox-test-jarvis3-instruct-styled.wav" "$INSTRUCT")"
log "instruct styled HTTP=$c elapsed=${e}s"

log "storage sample files:"
docker exec voicebox find /app/data -type f 2>/dev/null | head -40
