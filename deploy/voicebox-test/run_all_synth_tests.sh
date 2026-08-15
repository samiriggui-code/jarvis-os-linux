#!/usr/bin/env bash
set -euo pipefail
VB=http://127.0.0.1:17600
OUT=/tmp/voicebox-test/output
mkdir -p "$OUT"
log(){ echo "[$(date +%H:%M:%S)] $*"; }

declare -A PIDS
while read -r name pid sc; do PIDS[$name]=$pid; done < <(curl -s "$VB/profiles" | python3 -c 'import json,sys
for p in json.load(sys.stdin): print(p["name"], p["id"], p.get("sample_count",0))')

synth() {
  local name="$1" pid="$2" text="$3" out="$4" instruct="${5:-}"
  local payload
  if [[ -n "$instruct" ]]; then
    payload=$(python3 -c "import json,sys; print(json.dumps({'profile_id':sys.argv[1],'text':sys.argv[2],'language':'fr','engine':'qwen','personality':False,'model_size':'0.6B','instruct':sys.argv[3]}))" "$pid" "$text" "$instruct")
  else
    payload=$(python3 -c "import json,sys; print(json.dumps({'profile_id':sys.argv[1],'text':sys.argv[2],'language':'fr','engine':'qwen','personality':False,'model_size':'0.6B'}))" "$pid" "$text")
  fi
  local start end code
  start=$(date +%s.%N)
  code=$(curl -s -o "$out" -w '%{http_code}' -X POST "$VB/generate/stream" -H 'Content-Type: application/json' -d "$payload")
  end=$(date +%s.%N)
  local elapsed size
  elapsed=$(python3 -c "print(f'{float('$end')-float('$start'):.2f}')")
  size=$(stat -c%s "$out" 2>/dev/null || echo 0)
  log "$name HTTP=$code elapsed=${elapsed}s wav_bytes=$size file=$(file -b "$out" 2>/dev/null || echo n/a)"
}

PHRASE="Analyse terminée. Les données sont cohérentes et aucune anomalie critique n'a été détectée."
INSTRUCT="Calm, composed and confident. Clear precise diction. Moderate conversational pace. Subtle dry wit. Professional futuristic butler. Never theatrical."
J3="Le noyau répond correctement. J'effectue maintenant une vérification des services disponibles."

docker stats voicebox --no-stream || true
for name in jarvis jarvis2 hermes; do
  synth "$name" "${PIDS[$name]}" "$PHRASE" "$OUT/voicebox-test-$name.wav"
done

synth "jarvis3-instruct-neutral" "${PIDS[jarvis3]}" "$J3" "$OUT/voicebox-test-jarvis3-instruct-neutral.wav"
synth "jarvis3-instruct-styled" "${PIDS[jarvis3]}" "$J3" "$OUT/voicebox-test-jarvis3-instruct-styled.wav" "$INSTRUCT"

docker stats voicebox --no-stream || true
log "profiles:" 
curl -s "$VB/profiles" | python3 -m json.tool
log "outputs:" 
ls -la "$OUT"/voicebox-test-*.wav
