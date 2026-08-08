# Start JARVIS agent (system tray icon — no browser page).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$CorePy = Join-Path $Root "..\..\core\.venv\Scripts\python.exe"
if (Test-Path $CorePy) { $Py = $CorePy } else { $Py = "python" }
$Agent = Join-Path $Root "windows_agent.py"
$LogDir = Join-Path $Root "data"
$LogFile = Join-Path $LogDir "agent-local.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

& $Py -m pip install -q pystray pillow websockets 2>$null

$running = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*windows_agent.py*" }

if ($running) {
    Write-Host "Agent deja actif (icone barre des taches)" -ForegroundColor Green
    exit 0
}

Write-Host "Demarrage agent JARVIS (icone pres des apps reduites)..." -ForegroundColor Cyan
$cmd = "& '$Py' '$Agent' *>> '$LogFile'"
Start-Process powershell.exe -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $cmd) -WindowStyle Hidden -WorkingDirectory $Root
Start-Sleep -Seconds 3

$running = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*windows_agent.py*" }

if ($running) {
    Write-Host "OK - icone JARVIS dans la barre des taches (zone notification)" -ForegroundColor Green
    Write-Host "Clic droit : Parametres / HUD / Quitter"
} else {
    Write-Host "Echec - voir $LogFile" -ForegroundColor Red
    if (Test-Path $LogFile) { Get-Content $LogFile -Tail 25 }
    exit 1
}
