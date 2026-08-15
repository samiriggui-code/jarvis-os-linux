# Démarre l'agent JARVIS — ZÉRO fenêtre console.
# Idempotent. Mutex anti-respawn. Détecte python + pythonw.
# JAMAIS de powershell -Command imbriqué (cause des flashs terminaux).
#
# `$ErrorActionPreference = "SilentlyContinue"` (ci-dessous) veut dire que
# TOUTE erreur — y compris un `Start-Process` qui échoue (ex: fichier de log
# encore verrouillé par l'ancien process en cours de sortie) — disparaît sans
# trace. Observé en pratique : l'agent quitte (restart tray ou autre), le
# relaunch échoue silencieusement, l'agent reste mort indéfiniment, zéro
# indice pour le comprendre. `Write-EnsureLog` ci-dessous trace chaque
# décision dans un fichier séparé (`ensure.log`) précisément pour rendre ce
# genre d'échec diagnosticable sans rouvrir une fenêtre console.
param(
    [switch]$Restart
)

$ErrorActionPreference = "SilentlyContinue"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigRoot = Join-Path $env:ProgramData "JARVIS"
$InstallDir = Join-Path $ConfigRoot "agent"
$EnvFile = Join-Path $ConfigRoot "agent.env"
$LogDir = Join-Path $ConfigRoot "logs"
$LogOut = Join-Path $LogDir "agent.out.log"
$LogErr = Join-Path $LogDir "agent.err.log"
$LockFile = Join-Path $LogDir "ensure.lock"
$EnsureLog = Join-Path $LogDir "ensure.log"

function Write-EnsureLog {
    param([string]$Message)
    try {
        $line = "{0:yyyy-MM-dd HH:mm:ss} · {1}" -f (Get-Date), $Message
        Add-Content -Path $EnsureLog -Value $line -Encoding utf8 -ErrorAction SilentlyContinue
        if ((Test-Path $EnsureLog) -and ((Get-Item $EnsureLog).Length -gt 512KB)) {
            Move-Item -Force $EnsureLog "$EnsureLog.bak" -ErrorAction SilentlyContinue
        }
    } catch {}
}

function Get-AgentProcesses {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -match '^pythonw?\.exe$' -and
        $_.CommandLine -and
        ($_.CommandLine -like '*windows_agent.py*')
    }
}

function Test-AgentRunning {
    return [bool](Get-AgentProcesses)
}

function Wait-AgentStopped {
    param([int]$TimeoutSec = 20)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-AgentRunning)) { return $true }
        Start-Sleep -Milliseconds 400
    }
    return -not (Test-AgentRunning)
}

function Get-AgentInstallDir {
    # Préférer $ScriptRoot (où CE script vit) à $InstallDir (ProgramData) :
    #   - Tâche planifiée prod : ensure-agent.vbs vit DANS ProgramData\JARVIS\agent,
    #     donc $ScriptRoot == $InstallDir déjà — cet ordre ne change rien là-bas.
    #   - start-local.ps1 (dev, appelé depuis le repo) : $ScriptRoot == le repo.
    #     L'ancien ordre préférait TOUJOURS ProgramData même ici, donc éditer le
    #     repo et relancer en dev ne testait jamais le code édité tant qu'on
    #     n'avait pas resynchronisé via install-agent.ps1 — piège d'itération
    #     silencieux, cause probable de "mes changements n'ont aucun effet".
    $repoAgent = Join-Path $ScriptRoot "windows_agent.py"
    $repoReady = (Test-Path $repoAgent) -and
        (Test-Path (Join-Path $ScriptRoot "metrics.py")) -and
        (Test-Path (Join-Path $ScriptRoot "tray_app.py")) -and
        (Test-Path (Join-Path $ScriptRoot "agent_lib.py"))
    $pdAgent = Join-Path $InstallDir "windows_agent.py"
    $pdReady = (Test-Path $pdAgent) -and
        (Test-Path (Join-Path $InstallDir "metrics.py")) -and
        (Test-Path (Join-Path $InstallDir "tray_app.py"))

    if ($repoReady) { return $ScriptRoot }
    if ($pdReady) { return $InstallDir }
    if (Test-Path $repoAgent) { return $ScriptRoot }
    if (Test-Path $pdAgent) { return $InstallDir }
    return $null
}

function Resolve-PythonHost {
    param([string]$Root)
    $candidates = @(
        (Join-Path $Root ".venv\Scripts\pythonw.exe"),
        (Join-Path $Root "..\..\core\.venv\Scripts\pythonw.exe")
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return (Resolve-Path $c).Path }
    }
    $cmdW = Get-Command pythonw.exe -ErrorAction SilentlyContinue
    if ($cmdW) { return $cmdW.Source }

    $candidates2 = @(
        (Join-Path $Root ".venv\Scripts\python.exe"),
        (Join-Path $Root "..\..\core\.venv\Scripts\python.exe")
    )
    foreach ($c in $candidates2) {
        if (Test-Path $c) { return (Resolve-Path $c).Path }
    }
    $cmd = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Mutex : 2 ensure en parallèle = multi-spawn + flash
$lockStream = $null
try {
    $lockStream = [System.IO.File]::Open(
        $LockFile,
        [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )
} catch {
    exit 0
}

try {
    if ($Restart) {
        Write-EnsureLog "restart · attente arrêt process"
        if (-not (Wait-AgentStopped -TimeoutSec 20)) {
            Write-EnsureLog "restart · timeout · kill forcé"
            Get-AgentProcesses | ForEach-Object {
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            }
            Start-Sleep -Milliseconds 800
        }
    } elseif (Test-AgentRunning) {
        Write-EnsureLog "skip · agent déjà en cours"
        exit 0
    }

    $dir = Get-AgentInstallDir
    if (-not $dir) { Write-EnsureLog "abort · aucun dossier agent valide (ni repo ni ProgramData)"; exit 0 }

    $AgentScript = Join-Path $dir "windows_agent.py"
    if (-not (Test-Path $AgentScript)) { Write-EnsureLog "abort · windows_agent.py absent de $dir"; exit 0 }

    if (Test-Path $EnvFile) {
        Get-Content $EnvFile | ForEach-Object {
            if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
                $name = $matches[1]
                $val = $matches[2].Trim().Trim('"').Trim("'")
                if ($val -ne "") {
                    Set-Item -Path "Env:$name" -Value $val
                }
            }
        }
    }

    $Py = Resolve-PythonHost -Root $dir
    if (-not $Py) { Write-EnsureLog "abort · aucun python/pythonw trouvé (root=$dir)"; exit 1 }

    if (-not $env:JARVIS_AGENT_TRAY) { $env:JARVIS_AGENT_TRAY = "1" }
    if (-not $env:JARVIS_AGENT_PANEL) { $env:JARVIS_AGENT_PANEL = "1" }

    foreach ($lf in @($LogOut, $LogErr)) {
        if ((Test-Path $lf) -and ((Get-Item $lf).Length -gt 2MB)) {
            Move-Item -Force $lf "$lf.bak" -ErrorAction SilentlyContinue
        }
    }

    if (-not $Restart -and (Test-AgentRunning)) {
        Write-EnsureLog "skip · agent déjà en cours (re-check post-scan)"
        exit 0
    }

    # Redirect force CreateNoWindow ; JAMAIS powershell -Command wrapper.
    # Try/catch explicite : sans lui, un échec ici (ex: $LogErr encore
    # verrouillé par l'ancien process pas totalement sorti) disparaissait
    # sans laisser l'agent tourner ET sans laisser de trace.
    try {
        $proc = Start-Process -FilePath $Py `
            -ArgumentList "`"$AgentScript`"" `
            -WorkingDirectory $dir `
            -WindowStyle Hidden `
            -RedirectStandardOutput $LogOut `
            -RedirectStandardError $LogErr `
            -PassThru `
            -ErrorAction Stop
        Write-EnsureLog "launched · dir=$dir py=$Py pid=$($proc.Id)"
    } catch {
        Write-EnsureLog "FAILED · Start-Process · dir=$dir py=$Py · $($_.Exception.Message)"
    }

    exit 0
}
finally {
    if ($lockStream) {
        $lockStream.Close()
        $lockStream.Dispose()
    }
}
