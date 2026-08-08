# Installe l'agent JARVIS Windows (zero-config) — copie locale ou téléchargement NUC.
# Usage :
#   .\install-agent.ps1
#   .\install-agent.ps1 -FromNuc
#   .\install-agent.ps1 -Uninstall

param(
    [switch]$FromNuc,
    [switch]$Uninstall,
    [switch]$NoTask
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigRoot = Join-Path $env:ProgramData "JARVIS"
$InstallDir = Join-Path $ConfigRoot "agent"
$TaskName = "JARVIS Windows Agent"

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

function Find-Python {
    $CorePy = Join-Path $Root "..\..\core\.venv\Scripts\python.exe"
    if (Test-Path $CorePy) { return $CorePy }
    $LocalPy = Join-Path $InstallDir ".venv\Scripts\python.exe"
    if (Test-Path $LocalPy) { return $LocalPy }
    return "python"
}

function Remove-AgentTask {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Step "Tâche planifiée supprimée"
    }
}

if ($Uninstall) {
    Remove-AgentTask
    if (Test-Path $InstallDir) {
        Remove-Item -Recurse -Force $InstallDir
        Write-Step "Agent supprimé : $InstallDir"
    }
    $envFile = Join-Path $ConfigRoot "agent.env"
    if (Test-Path $envFile) { Remove-Item -Force $envFile }
    exit 0
}

Write-Step "Installation agent JARVIS → $InstallDir"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# ── 1. Copie ou téléchargement ───────────────────────────────────────────────
$copied = $false
if (-not $FromNuc) {
    foreach ($name in @(
        "windows_agent.py", "agent_lib.py", "inventory.py", "apps.py",
        "discover.py", "config.py", "status.py", "runtime.py", "tray_app.py",
        "panel_server.py", "panel.html", "requirements.txt",
        "start-agent.ps1", "ensure-agent.ps1", "open-panel.ps1", "bootstrap.json"
    )) {
        $src = Join-Path $Root $name
        if (Test-Path $src) {
            Copy-Item -Force $src (Join-Path $InstallDir $name)
            $copied = $true
        }
    }
}

if (-not $copied -or $FromNuc) {
    Write-Step "Téléchargement depuis le Core…"
    $Py = Find-Python
    Push-Location $Root
    try {
        $discoverJson = & $Py discover.py --json 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $discoverJson) {
            throw "Core introuvable — sync NUC ou définissez JARVIS_WS_URL"
        }
        $disc = $discoverJson | ConvertFrom-Json
        $base = ($disc.hud_url).TrimEnd("/") + "/v1/agent/"
        foreach ($name in @(
            "windows_agent.py", "agent_lib.py", "inventory.py", "apps.py",
            "discover.py", "config.py", "status.py", "runtime.py", "tray_app.py",
            "panel_server.py", "panel.html", "requirements.txt", "bootstrap.json"
        )) {
            $url = $base + $name
            $dest = Join-Path $InstallDir $name
            try {
                Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -TimeoutSec 15
            } catch {
                Write-Warning "skip $name ($url)"
            }
        }
        Copy-Item -Force (Join-Path $Root "ensure-agent.ps1") (Join-Path $InstallDir "ensure-agent.ps1") -ErrorAction SilentlyContinue
        Copy-Item -Force (Join-Path $Root "start-agent.ps1") (Join-Path $InstallDir "start-agent.ps1") -ErrorAction SilentlyContinue
    } finally {
        Pop-Location
    }
}

# ── 2. venv + deps ───────────────────────────────────────────────────────────
Write-Step "Python + dépendances"
$Py = Find-Python
if ($Py -eq "python") {
    Push-Location $InstallDir
    try {
        if (-not (Test-Path ".venv")) {
            python -m venv .venv
        }
        $Py = Join-Path $InstallDir ".venv\Scripts\python.exe"
        & $Py -m pip install -q -r requirements.txt
    } finally {
        Pop-Location
    }
} else {
    Push-Location $InstallDir
    try {
        & $Py -m pip install -q -r requirements.txt
    } finally {
        Pop-Location
    }
}

# ── 3. Découverte Core + config ──────────────────────────────────────────────
Write-Step "Découverte Core"
Push-Location $InstallDir
try {
    & $Py discover.py --save
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Core non joignable — config par défaut LAN"
        @"
JARVIS_WS_URL=ws://192.168.1.37:8080/ws
JARVIS_HUD_URL=http://192.168.1.37:8080
"@ | Set-Content -Encoding UTF8 (Join-Path $ConfigRoot "agent.env")
    }
} finally {
    Pop-Location
}

# ── 4. Tâche planifiée (session utilisateur = lancement .exe OK) ───────────────
if (-not $NoTask) {
    Write-Step "Tâche planifiée au logon"
    Remove-AgentTask
    $ensure = Join-Path $InstallDir "ensure-agent.ps1"
    $action = New-ScheduledTaskAction -Execute "powershell.exe" `
        -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ensure`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
        -Settings $settings -Description "Agent machine JARVIS — inventaire + app.launch" | Out-Null
}

# ── 5. Démarrage immédiat ────────────────────────────────────────────────────
Write-Step "Démarrage agent"
& (Join-Path $InstallDir "ensure-agent.ps1")

Write-Host ""
Write-Host "OK — Agent installé." -ForegroundColor Green
Write-Host "  Dossier : $InstallDir"
Write-Host "  Config  : $(Join-Path $ConfigRoot 'agent.env')"
Write-Host "  HUD     : .\launch-jarvis.ps1"
Write-Host ""
