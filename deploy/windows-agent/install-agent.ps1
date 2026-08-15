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
    if (-not $existing) { return }
    try {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
        Write-Step "Tâche planifiée supprimée"
    } catch {
        Write-Warning "Unregister refusé ($($_.Exception.Message)) — tentative Set-ScheduledTask / disable"
    }
}

function Register-AgentTaskSilent {
    param([string]$EnsureVbs)
    $action = New-ScheduledTaskAction -Execute "wscript.exe" `
        -Argument "//B //Nologo `"$EnsureVbs`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    $settings.Hidden = $true
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        try {
            Set-ScheduledTask -TaskName $TaskName -Action $action -Settings $settings -ErrorAction Stop | Out-Null
            Enable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
            Write-Step "Tâche planifiée mise à jour (wscript silencieux)"
            return
        } catch {
            Write-Warning "Set-ScheduledTask refusé — désactivation de l'ancienne tâche (évite flash logon)"
            Disable-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
            return
        }
    }
    try {
        Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
            -Settings $settings -Description "Agent machine JARVIS (silencieux — orbe tray)" -ErrorAction Stop | Out-Null
        Write-Step "Tâche planifiée créée (wscript silencieux)"
    } catch {
        Write-Warning "Register-ScheduledTask échoué: $($_.Exception.Message)"
    }
}

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Stop-AgentProcesses {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -match '^pythonw?\.exe$' -and $_.CommandLine -and ($_.CommandLine -like '*windows_agent.py*')
    } | ForEach-Object {
        Write-Step "Arrêt agent pid $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

if (-not $Uninstall -and -not (Test-IsAdmin)) {
    Write-Step "Élévation admin requise — ProgramData\JARVIS\agent est en lecture seule pour l'utilisateur standard"
    $elevArgs = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $MyInvocation.MyCommand.Path
    )
    if ($FromNuc) { $elevArgs += '-FromNuc' }
    if ($NoTask) { $elevArgs += '-NoTask' }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $elevArgs -Wait
    exit $LASTEXITCODE
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
Stop-AgentProcesses
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# ── 1. Copie ou téléchargement ───────────────────────────────────────────────
$copied = $false
if (-not $FromNuc) {
    foreach ($name in @(
        "windows_agent.py", "agent_lib.py", "single_instance.py", "inventory.py", "apps.py", "metrics.py",
        "discover.py", "config.py", "status.py", "runtime.py", "tray_app.py", "icons.py",
        "panel_server.py", "panel.html", "requirements.txt",
        "agent_restart.py", "dev_agent_cli.py", "workspace_local.py", "dev_agent_fake.py", "fake_agent.py",
        "start-agent.ps1", "ensure-agent.ps1", "ensure-agent.vbs", "open-panel.ps1", "bootstrap.json", "CHANGELOG.md"
    )) {
        $src = Join-Path $Root $name
        if (Test-Path $src) {
            Copy-Item -Force $src (Join-Path $InstallDir $name)
            $copied = $true
        }
    }
    # Orbe HUD (tray vivant + panel)
    $assetsSrc = Join-Path $Root "assets"
    if (Test-Path $assetsSrc) {
        $assetsDst = Join-Path $InstallDir "assets"
        New-Item -ItemType Directory -Force -Path $assetsDst | Out-Null
        Copy-Item -Force (Join-Path $assetsSrc "*") $assetsDst
        $copied = $true
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
            "windows_agent.py", "agent_lib.py", "single_instance.py", "inventory.py", "apps.py", "metrics.py",
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
        Copy-Item -Force (Join-Path $Root "ensure-agent.vbs") (Join-Path $InstallDir "ensure-agent.vbs") -ErrorAction SilentlyContinue
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
JARVIS_HUD_URL=https://jarvis.global-it-ss.com
"@ | Set-Content -Encoding UTF8 (Join-Path $ConfigRoot "agent.env")
    }
} finally {
    Pop-Location
}

# ── 4. Tâche planifiée (VBS Style 0 = zéro flash console au logon) ─────────────
if (-not $NoTask) {
    Write-Step "Tâche planifiée au logon (silencieuse)"
    Remove-AgentTask
    $ensureVbs = Join-Path $InstallDir "ensure-agent.vbs"
    if (-not (Test-Path $ensureVbs)) {
        Copy-Item -Force (Join-Path $Root "ensure-agent.vbs") $ensureVbs
    }
    Register-AgentTaskSilent -EnsureVbs $ensureVbs
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
