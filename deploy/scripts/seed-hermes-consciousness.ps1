# Seed JARVIS consciousness into HERMES_HOME (SOUL + skills + memory).
# Real product rules for Hermes runtime -- not UI mocks.
# Usage:
#   powershell -ExecutionPolicy Bypass -File deploy/scripts/seed-hermes-consciousness.ps1
#   powershell -ExecutionPolicy Bypass -File deploy/scripts/seed-hermes-consciousness.ps1 -ForceSoul

param(
  [string]$HermesHome = "",
  [switch]$ForceSoul
)

$ErrorActionPreference = "Stop"

if (-not $HermesHome) {
  if ($env:HERMES_HOME) { $HermesHome = $env:HERMES_HOME }
  elseif (Test-Path (Join-Path $env:USERPROFILE ".hermes")) { $HermesHome = Join-Path $env:USERPROFILE ".hermes" }
  elseif ($env:LOCALAPPDATA) { $HermesHome = Join-Path $env:LOCALAPPDATA "hermes" }
  else { $HermesHome = Join-Path $env:USERPROFILE ".hermes" }
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Src = Join-Path $Root "deploy\hermes"

if (-not (Test-Path $Src)) {
  throw "Missing source: $Src"
}

New-Item -ItemType Directory -Force -Path $HermesHome | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $HermesHome "skills") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $HermesHome "memories") | Out-Null

$soulSrc = Join-Path $Src "SOUL.md"
$soulDst = Join-Path $HermesHome "SOUL.md"
if ((-not (Test-Path $soulDst)) -or $ForceSoul) {
  Copy-Item $soulSrc $soulDst -Force
  Write-Host "SOUL.md -> $soulDst"
} else {
  Write-Host "SOUL.md kept (pass -ForceSoul to overwrite): $soulDst"
}

foreach ($skill in @("jarvis-os", "family-enroll")) {
  $from = Join-Path $Src "skills\$skill"
  $to = Join-Path $HermesHome "skills\$skill"
  New-Item -ItemType Directory -Force -Path $to | Out-Null
  Copy-Item (Join-Path $from "*") $to -Recurse -Force
  Write-Host "skill $skill -> $to"
}

$memSrc = Join-Path $Src "memories\MEMORY.md"
$memDst = Join-Path $HermesHome "memories\MEMORY.md"
if ((-not (Test-Path $memDst)) -or $ForceSoul) {
  Copy-Item $memSrc $memDst -Force
  Write-Host "MEMORY.md -> $memDst"
} else {
  $existing = ""
  if (Test-Path $memDst) { $existing = Get-Content $memDst -Raw -ErrorAction SilentlyContinue }
  if ($existing -notmatch "JARVIS OS") {
    Add-Content -Path $memDst -Value ""
    Add-Content -Path $memDst -Value (Get-Content $memSrc -Raw)
    Write-Host "MEMORY.md appended JARVIS block"
  } else {
    Write-Host "MEMORY.md already has JARVIS"
  }
}

$ext = ((Join-Path $Src "skills") -replace "\\", "/")
$cfg = Join-Path $HermesHome "config.yaml"
$marker = "JARVIS OS seed-hermes-consciousness"
if (Test-Path $cfg) {
  $raw = Get-Content $cfg -Raw
  if ($raw -notmatch [regex]::Escape($marker)) {
    $lines = @(
      "",
      "# --- $marker ---",
      "# skills:",
      "#   external_dirs:",
      "#     - `"$ext`""
    )
    Add-Content -Path $cfg -Value ($lines -join "`n")
    Write-Host "config.yaml: external_dirs snippet added (commented)"
  }
} else {
  $yaml = @(
    "# Hermes config - JARVIS OS seed",
    "skills:",
    "  external_dirs:",
    "    - `"$ext`""
  ) -join "`n"
  Set-Content -Path $cfg -Value $yaml -Encoding UTF8
  Write-Host "config.yaml created with external_dirs -> $ext"
}

Write-Host ""
Write-Host "OK - Hermes Home: $HermesHome"
Write-Host "Restart Hermes gateway (or next message) to reload SOUL/skills."
