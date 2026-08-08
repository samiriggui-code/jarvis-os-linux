#!/usr/bin/env bash
# Phase 2 — gate refactor Core (post Phase 1)
#
# Usage :
#   ./deploy/scripts/core-phase2-smoke.sh
#   ./deploy/scripts/core-phase2-smoke.sh --ws
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/core"
PY="${ROOT}/core/.venv/bin/python"
if [[ ! -x "$PY" ]]; then PY=python3; fi
exec "$PY" -m jarvis_core._smoke_phase2 "$@"
