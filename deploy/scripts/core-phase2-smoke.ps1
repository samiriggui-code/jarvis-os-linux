# Phase 2 — gate refactor Core (post Phase 1)
#
# Usage :
#   .\deploy\scripts\core-phase2-smoke.ps1
#   .\deploy\scripts\core-phase2-smoke.ps1 --ws
param(
    [switch]$Ws
)
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location (Join-Path $Root "core")
$Py = Join-Path $Root "core\.venv\Scripts\python.exe"
if (-not (Test-Path $Py)) { $Py = "python" }
$Args = @("-m", "jarvis_core._smoke_phase2")
if ($Ws) { $Args += "--ws" }
& $Py @Args
