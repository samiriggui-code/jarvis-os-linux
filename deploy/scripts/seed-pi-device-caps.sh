#!/usr/bin/env bash
# Seed de TEST — simule device.register + capabilities pour pi-salon.
# Le Pi réel doit poster lui-même ; ce script n'est PAS le runtime satellite.
#
# Usage (depuis une machine qui joint le NUC) :
#   bash deploy/scripts/seed-pi-device-caps.sh
#   JARVIS_DEVICES_URL=http://192.168.1.37:8080/v1/devices bash deploy/scripts/seed-pi-device-caps.sh

set -euo pipefail
BASE="${JARVIS_DEVICES_URL:-http://127.0.0.1:8766/v1/devices}"
TOKEN="${JARVIS_SALON_TOKEN:-}"
AUTH=()
if [[ -n "$TOKEN" ]]; then
  AUTH=(-H "Authorization: Bearer ${TOKEN}")
fi

echo "==> register pi-salon → $BASE/register"
curl -sS -X POST "${BASE}/register" "${AUTH[@]}" \
  -H 'Content-Type: application/json' \
  -d '{
    "device_id": "pi-salon",
    "type": "raspberry_pi",
    "runtime_kind": "jarvis-ear",
    "metadata": {"role": "salon", "source": "seed-script"}
  }' | tee /tmp/jarvis-device-register.json
echo

echo "==> capabilities pi-salon"
curl -sS -X POST "${BASE}/capabilities" "${AUTH[@]}" \
  -H 'Content-Type: application/json' \
  -d '{
    "device_id": "pi-salon",
    "capabilities": [
      {"name":"camera","capability_id":"camera.capture","value":true,"metadata":{"model":"LG_USB"}},
      {"name":"speaker","capability_id":"speaker.output","value":true,"metadata":{"via":"jack"}},
      {"name":"gpio","capability_id":"gpio.access","value":true,"metadata":{}},
      {"name":"microphone","capability_id":"microphone.input","value":true,"metadata":{"via":"jarvis-ear"}}
    ]
  }' | tee /tmp/jarvis-device-caps.json
echo

echo "==> GET devices"
curl -sS "${BASE}" "${AUTH[@]}" | tee /tmp/jarvis-devices.json
echo
echo "DONE"
