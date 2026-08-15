# Ouvre les parametres agent (fenetre native — pas de page web).
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $Root "start-local.ps1")
Write-Host "Clic droit sur l'icone JARVIS -> Parametres..."
