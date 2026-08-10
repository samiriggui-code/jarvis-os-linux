# Sync HUD + Dashboard buildes -> NUC (quand dist/ prets en local).
#
# Usage :
#   cd hud; npm run build
#   cd dashboard; npm run build
#   powershell -File deploy/scripts/sync-fronts-nuc.ps1 [-ReloadNginx]
#
# Cibles NUC :
#   /opt/jarvis/hud/dist/       -> nginx :8080 + HTTPS jarvis.global-it-ss.com
#   /opt/jarvis/dashboard/dist/ -> /dashboard/ (HTTP + HTTPS)

param(
    [string]$Nuc = "jarvis-nuc-wan",
    [switch]$ReloadNginx
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$HudDist = Join-Path $Root "hud/dist"
$DashDist = Join-Path $Root "dashboard/dist"

if (-not (Test-Path (Join-Path $HudDist "index.html"))) {
    Write-Error "hud/dist absent - lance: cd hud; npm run build"
}
if (-not (Test-Path (Join-Path $DashDist "index.html"))) {
    Write-Error "dashboard/dist absent - lance: cd dashboard; npm run build"
}

Write-Host "==> HUD -> /opt/jarvis/hud/dist/" -ForegroundColor Cyan
ssh -o BatchMode=yes $Nuc "mkdir -p /tmp/jarvis-hud-dist /tmp/jarvis-dash-dist"
scp -o BatchMode=yes -r "$HudDist\*" "${Nuc}:/tmp/jarvis-hud-dist/"
scp -o BatchMode=yes -r "$DashDist\*" "${Nuc}:/tmp/jarvis-dash-dist/"

$remote = "set -e; rsync -a --delete /tmp/jarvis-hud-dist/ /opt/jarvis/hud/dist/; rsync -a --delete /tmp/jarvis-dash-dist/ /opt/jarvis/dashboard/dist/; rm -rf /tmp/jarvis-hud-dist /tmp/jarvis-dash-dist; ls -la /opt/jarvis/hud/dist/index.html /opt/jarvis/dashboard/dist/index.html"
if ($ReloadNginx) {
    scp -o BatchMode=yes "$Root/deploy/nginx/jarvis-hud.conf" "${Nuc}:/tmp/jarvis-hud.conf"
    $remote += "; cp /tmp/jarvis-hud.conf /opt/jarvis/share/nginx/jarvis-hud.conf; cp /tmp/jarvis-hud.conf /etc/nginx/conf.d/jarvis-hud.conf; nginx -t && systemctl reload nginx"
}
ssh -o BatchMode=yes $Nuc $remote

Write-Host "==> Fronts sync OK - test https://jarvis.global-it-ss.com/ (cam/mic HTTPS)" -ForegroundColor Green
