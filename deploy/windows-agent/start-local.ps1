# Dev local — délègue à ensure-agent (zéro fenêtre, pythonw).
#
# `ensure-agent.ps1` est idempotent PAR CONCEPTION (logon/scheduled task) : il
# ne relance jamais un agent déjà vivant, même si son code est périmé — piège
# classique en itération : on édite, on relance ce script, l'ancien process
# (code d'avant) tourne toujours et absorbe le "déjà démarré" silencieusement,
# zéro changement visible. Ce script-ci est le point d'entrée DEV explicite :
# on tue toute instance existante d'abord, pour garantir que le code qui
# tourne après est bien celui qu'on vient d'éditer.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

$stale = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^pythonw?\.exe$' -and $_.CommandLine -like '*windows_agent.py*'
}
if ($stale) {
    foreach ($proc in $stale) {
        Write-Host "Arrêt agent existant (PID $($proc.ProcessId), code potentiellement périmé)…" -ForegroundColor Yellow
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 800
}

& (Join-Path $Root "ensure-agent.ps1")
Start-Sleep -Seconds 2
$running = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^pythonw?\.exe$' -and $_.CommandLine -like '*windows_agent.py*'
}
if ($running) {
    Write-Host "OK — agent JARVIS discret (orbe tray)" -ForegroundColor Green
} else {
    Write-Host "Echec — voir $env:ProgramData\JARVIS\logs\agent.err.log" -ForegroundColor Red
    exit 1
}
