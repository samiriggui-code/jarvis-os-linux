#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../core"
python -m jarvis_core._smoke_phase3
