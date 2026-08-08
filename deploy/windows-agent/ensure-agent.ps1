# Démarre l'agent si absent (idempotent — logon ou manuel).
$ErrorActionPreference = "SilentlyContinue"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigRoot = Join-Path $env:ProgramData "JARVIS"
$InstallDir = Join-Path $ConfigRoot "agent"
$EnvFile = Join-Path $ConfigRoot "agent.env"
$LogDir = Join-Path $ConfigRoot "logs"
$LogFile = Join-Path $LogDir "agent.log"

# Dev local : repo deploy/windows-agent si pas encore installé dans ProgramData
if (-not (Test-Path (Join-Path $InstallDir "windows_agent.py"))) {
    if (Test-Path (Join-Path $ScriptRoot "windows_agent.py")) {
        $InstallDir = $ScriptRoot
        $LogDir = Join-Path $ScriptRoot "data"
        $LogFile = Join-Path $LogDir "agent.log"
        $EnvFile = Join-Path $ConfigRoot "agent.env"
    } else {
        $installer = Join-Path $ScriptRoot "install-agent.ps1"
        if (Test-Path $installer) {
            & $installer -NoTask
        }
        exit 0
    }
}

$AgentScript = Join-Path $InstallDir "windows_agent.py"

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

$running = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*windows_agent.py*" }
if ($running) { exit 0 }

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$Py = Join-Path $InstallDir ".venv\Scripts\python.exe"
if (-not (Test-Path $Py)) {
    $CorePy = Join-Path $InstallDir "..\..\core\.venv\Scripts\python.exe"
    if (Test-Path $CorePy) { $Py = $CorePy } else { $Py = "python" }
}

$arg = "-NoProfile -ExecutionPolicy Bypass -Command ""& '$Py' '$AgentScript' *>> '$LogFile'"""
Start-Process powershell.exe -ArgumentList $arg -WindowStyle Hidden -WorkingDirectory $InstallDir
