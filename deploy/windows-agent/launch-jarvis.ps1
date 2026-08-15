# Lance JARVIS : agent machine + HUD dans le navigateur.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallDir = Join-Path $env:ProgramData "JARVIS\agent"
$ConfigRoot = Join-Path $env:ProgramData "JARVIS"

function Find-Python {
    $paths = @(
        (Join-Path $InstallDir ".venv\Scripts\python.exe"),
        (Join-Path $Root "..\..\core\.venv\Scripts\python.exe"),
        (Join-Path $Root ".venv\Scripts\python.exe")
    )
    foreach ($p in $paths) { if (Test-Path $p) { return $p } }
    return "python"
}

# Auto-install si première fois
if (-not (Test-Path (Join-Path $InstallDir "windows_agent.py"))) {
    Write-Host "Première utilisation — installation agent…" -ForegroundColor Yellow
    & (Join-Path $Root "install-agent.ps1")
}

# Agent en arrière-plan
$ensure = Join-Path $InstallDir "ensure-agent.ps1"
if (Test-Path $ensure) {
    & $ensure
} else {
    & (Join-Path $Root "ensure-agent.ps1")
}

# HUD URL
$hudUrl = $env:JARVIS_HUD_URL
$envFile = Join-Path $ConfigRoot "agent.env"
if (-not $hudUrl -and (Test-Path $envFile)) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*JARVIS_HUD_URL=(.*)$') {
            $hudUrl = $matches[1].Trim().Trim('"').Trim("'")
        }
    }
}

if (-not $hudUrl) {
    $Py = Find-Python
    Push-Location $(if (Test-Path $InstallDir) { $InstallDir } else { $Root })
    try {
        $json = & $Py discover.py --json 2>$null
        if ($json) {
            $disc = $json | ConvertFrom-Json
            $hudUrl = $disc.hud_url
        }
    } finally {
        Pop-Location
    }
}

if (-not $hudUrl) {
    $hudUrl = "http://192.168.1.37:8080"
}

Write-Host "JARVIS HUD -> $hudUrl" -ForegroundColor Green
Start-Process $hudUrl
Write-Host "Agent : icone barre des taches (clic droit pour config)" -ForegroundColor Cyan
