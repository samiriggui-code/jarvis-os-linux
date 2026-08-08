# Lance l'agent JARVIS (session courante ou install ProgramData).
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigRoot = Join-Path $env:ProgramData "JARVIS"
$InstallDir = Join-Path $ConfigRoot "agent"
$EnvFile = Join-Path $ConfigRoot "agent.env"

if (Test-Path (Join-Path $InstallDir "windows_agent.py")) {
    $Root = $InstallDir
}

$Agent = Join-Path $Root "windows_agent.py"
if (-not (Test-Path $Agent)) {
    Write-Host "Agent absent — lancez install-agent.ps1" -ForegroundColor Yellow
    exit 1
}

$Py = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $Py)) {
    $CoreVenv = Join-Path $Root "..\..\core\.venv\Scripts\python.exe"
    if (Test-Path $CoreVenv) {
        $Py = $CoreVenv
    } else {
        $Py = "python"
    }
}

if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
            $name = $matches[1]
            $val = $matches[2].Trim().Trim('"').Trim("'")
            if (-not [string]::IsNullOrWhiteSpace($val)) {
                Set-Item -Path "Env:$name" -Value $val
            }
        }
    }
}

if (-not $env:JARVIS_WS_URL) {
    Push-Location $Root
    try {
        $disc = & $Py discover.py --json 2>$null | ConvertFrom-Json
        if ($disc.ws_url) {
            $env:JARVIS_WS_URL = $disc.ws_url
            if ($disc.hud_url) { $env:JARVIS_HUD_URL = $disc.hud_url }
        }
    } catch {
        $env:JARVIS_WS_URL = "ws://192.168.1.37:8080/ws"
    } finally {
        Pop-Location
    }
}

Write-Host "JARVIS agent → $($env:JARVIS_WS_URL)"
& $Py $Agent @args
