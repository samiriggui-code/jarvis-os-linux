# Sync Core Python -> NUC (methode prod validee 2026-08-09).
#
# Usage :
#   powershell -File deploy/scripts/sync-core-only-nuc.ps1 [-Pip]
#
# Alias SSH : jarvis-nuc-wan (Windows). Ne touche pas .env / data/users / *.db NUC.

param(
    [string]$Nuc = "jarvis-nuc-wan",
    [string]$Opt = "/opt/jarvis",
    [switch]$Pip
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$Tmp = "/tmp/jarvis-core-push"

Write-Host "==> Core sync -> ${Nuc}:${Opt}/core/jarvis_core/" -ForegroundColor Cyan

ssh -o BatchMode=yes $Nuc "mkdir -p $Tmp"
scp -o BatchMode=yes -r "$Root\core\jarvis_core" "${Nuc}:${Tmp}/"
scp -o BatchMode=yes "$Root\core\requirements.txt" "${Nuc}:${Tmp}/"

if ($Pip) {
    $pipCmd = 'python3 -m venv .venv 2>/dev/null || true; . .venv/bin/activate; pip install -q -r requirements.txt || echo WARN pip partiel;'
} else {
    $pipCmd = 'echo skip pip;'
}

$remote = "set -e; rsync -a --delete --exclude '__pycache__' --exclude 'vision/data/*.onnx' --exclude 'vision/data/*.task' --exclude 'vision/data/*.xml' ${Tmp}/jarvis_core/ ${Opt}/core/jarvis_core/; cp ${Tmp}/requirements.txt ${Opt}/core/requirements.txt; cd ${Opt}/core; ${pipCmd} systemctl restart jarvis-core; sleep 3; systemctl is-active jarvis-core; journalctl -u jarvis-core -n 6 --no-pager | tail -6"

ssh -o BatchMode=yes $Nuc $remote
Write-Host "==> Core sync OK" -ForegroundColor Green
