#!/usr/bin/env bash
# Phase 0 — smokes Core sans HUD
#
# Usage :
#   ./deploy/scripts/core-phase0-smoke.sh
#   ./deploy/scripts/core-phase0-smoke.sh --ws   # + auth face si Core écoute
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/core"
PY="${ROOT}/core/.venv/bin/python"
if [[ ! -x "$PY" ]]; then PY=python3; fi
exec "$PY" -m jarvis_core._smoke_phase0 "$@"
