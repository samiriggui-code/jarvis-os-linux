# AUTH_SMOKE_TEST — gate Windows (critères 4–5 Core)
#
# Usage :
#   .\deploy\scripts\auth-smoke-test.ps1
#   $env:JARVIS_CORE_WS='ws://127.0.0.1:8765'; .\deploy\scripts\auth-smoke-test.ps1
#   $env:AUTH_SMOKE_HUD='1'; .\deploy\scripts\auth-smoke-test.ps1
#
# Tunnel NUC typique :
#   ssh -N -L 8765:127.0.0.1:8765 jarvis-nuc-wan

$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '../..')
$Ws = if ($env:JARVIS_CORE_WS) { $env:JARVIS_CORE_WS } else { 'ws://127.0.0.1:8765' }

Write-Host '======== AUTH_SMOKE_TEST ========'
Write-Host "WS=$Ws"

$Core = Join-Path $Root 'core'
Push-Location $Core
try {
  $Py = if (Test-Path '.\.venv\Scripts\python.exe') { '.\.venv\Scripts\python.exe' } else { 'python' }
  $env:JARVIS_CORE_WS = $Ws
  & $Py -m jarvis_core._smoke_auth_face
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

if ($env:AUTH_SMOKE_HUD -eq '1') {
  Write-Host ''
  $HudDir = Join-Path $Root 'vendor\hud'
  if (-not (Test-Path (Join-Path $HudDir 'scripts\authSmokeBrowser.mjs'))) {
    $HudDir = Join-Path $Root 'hud'
  }
  Push-Location $HudDir
  try {
    node scripts/authSmokeBrowser.mjs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  } finally {
    Pop-Location
  }
}

Write-Host '======== AUTH_SMOKE_TEST DONE ========'
