# Phase 0 — smokes Core sans HUD (Windows)
#
# Usage :
#   .\deploy\scripts\core-phase0-smoke.ps1
#   .\deploy\scripts\core-phase0-smoke.ps1 -Ws

param([switch]$Ws)

$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '../..')
$Core = Join-Path $Root 'core'
$Py = if (Test-Path (Join-Path $Core '.venv/Scripts/python.exe')) {
  Join-Path $Core '.venv/Scripts/python.exe'
} else { 'python' }

Push-Location $Core
try {
  $args = @('-m', 'jarvis_core._smoke_phase0')
  if ($Ws) { $args += '--ws' }
  & $Py @args
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
