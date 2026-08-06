# Provisionne Twingate pour le foyer JARVIS.
# Lit deploy/twingate/api.key  →  écrit deploy/twingate/connector.env
#
# Usage :
#   1. Colle la clé API dans deploy/twingate/api.key
#   2. .\deploy\scripts\twingate-provision-jarvis.ps1

[CmdletBinding()]
param(
    [string]$NetworkName = "Jarvis Maison",
    [string]$ConnectorName = "jarvis-nuc"
)

$ErrorActionPreference = "Stop"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $root "deploy\twingate"))) {
    $root = "c:\laragon\www\jarvis-os-linux"
}
$tgDir = Join-Path $root "deploy\twingate"
$apiKeyFile = Join-Path $tgDir "api.key"
$connectorEnv = Join-Path $tgDir "connector.env"

if (-not (Test-Path $apiKeyFile)) {
    Write-Host "Fichier manquant : $apiKeyFile"
    exit 1
}

$apiKey = (Get-Content $apiKeyFile -Raw) -split "`r?`n" |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -and $_ -notmatch '^\s*#' -and $_ -ne 'REMPLACE_MOI_PAR_TA_CLE_API' } |
    Select-Object -First 1

if (-not $apiKey) {
    Write-Host "Ouvre deploy\twingate\api.key et colle ta clé API (une ligne), puis relance."
    exit 1
}

$tenant = "globalitss"
$endpoint = "https://$tenant.twingate.com/api/graphql/"

function Invoke-Tg {
    param([string]$Query, [hashtable]$Variables = @{})
    $body = @{ query = $Query; variables = $Variables } | ConvertTo-Json -Depth 20 -Compress
    $headers = @{ "X-API-KEY" = $apiKey; "Content-Type" = "application/json" }
    $resp = Invoke-RestMethod -Uri $endpoint -Method Post -Headers $headers -Body $body
    if ($resp.errors) {
        throw ("GraphQL: " + (($resp.errors | ForEach-Object { $_.message }) -join "; "))
    }
    return $resp.data
}

Write-Host "==> Tenant $tenant"

# Remote Network
$nets = Invoke-Tg -Query 'query { remoteNetworks(first: 50) { edges { node { id name } } } }'
$net = $nets.remoteNetworks.edges | ForEach-Object { $_.node } | Where-Object { $_.name -eq $NetworkName } | Select-Object -First 1
if (-not $net) {
    $c = Invoke-Tg -Query 'mutation($name: String!) { remoteNetworkCreate(name: $name) { error entity { id name } } }' -Variables @{ name = $NetworkName }
    if ($c.remoteNetworkCreate.error) { throw $c.remoteNetworkCreate.error }
    $net = $c.remoteNetworkCreate.entity
    Write-Host "Remote Network créé : $($net.name)"
} else {
    Write-Host "Remote Network OK : $($net.name)"
}

# Connector
$conns = Invoke-Tg -Query 'query($id: ID!) { remoteNetwork(id: $id) { connectors(first: 50) { edges { node { id name } } } } }' -Variables @{ id = $net.id }
$conn = $conns.remoteNetwork.connectors.edges | ForEach-Object { $_.node } | Where-Object { $_.name -eq $ConnectorName } | Select-Object -First 1
if (-not $conn) {
    $c = Invoke-Tg -Query 'mutation($remoteNetworkId: ID!) { connectorCreate(remoteNetworkId: $remoteNetworkId) { error entity { id name } } }' -Variables @{ remoteNetworkId = $net.id }
    if ($c.connectorCreate.error) { throw $c.connectorCreate.error }
    $conn = $c.connectorCreate.entity
    try {
        $null = Invoke-Tg -Query 'mutation($id: ID!, $name: String!) { connectorUpdate(id: $id, name: $name) { error entity { id name } } }' -Variables @{ id = $conn.id; name = $ConnectorName }
    } catch { }
    Write-Host "Connector créé : $ConnectorName"
} else {
    Write-Host "Connector OK : $ConnectorName"
}

# Tokens
$tok = Invoke-Tg -Query 'mutation($connectorId: ID!) { connectorGenerateTokens(connectorId: $connectorId) { error ok connectorTokens { accessToken refreshToken } } }' -Variables @{ connectorId = $conn.id }
if ($tok.connectorGenerateTokens.error) { throw $tok.connectorGenerateTokens.error }
$access = $tok.connectorGenerateTokens.connectorTokens.accessToken
$refresh = $tok.connectorGenerateTokens.connectorTokens.refreshToken

@"
TWINGATE_NETWORK=$tenant
TWINGATE_ACCESS_TOKEN=$access
TWINGATE_REFRESH_TOKEN=$refresh
"@ | Set-Content -Path $connectorEnv -Encoding ascii -NoNewline
Add-Content -Path $connectorEnv -Value "" -Encoding ascii
Write-Host "Écrit : $connectorEnv"

# Groupe
$groups = Invoke-Tg -Query 'query { groups(first: 50) { edges { node { id name } } } }'
$groupNodes = @($groups.groups.edges | ForEach-Object { $_.node })
$group = $groupNodes | Where-Object { $_.name -match 'Everyone|Tous|All Users' } | Select-Object -First 1
if (-not $group) { $group = $groupNodes | Select-Object -First 1 }
if (-not $group) { throw "Aucun groupe Twingate — crée-en un dans la console." }
Write-Host "Groupe : $($group.name)"

# Resources
$wanted = @(
    @{ name = "Jarvis LAN foyer"; address = "192.168.1.0/24" },
    @{ name = "Jarvis HUD NUC";   address = "192.168.1.37" },
    @{ name = "Jarvis Pi salon";  address = "192.168.1.27" }
)
$existing = Invoke-Tg -Query 'query { resources(first: 100) { edges { node { id name address { value } } } } }'
$existingNodes = @($existing.resources.edges | ForEach-Object { $_.node })
foreach ($r in $wanted) {
    $hit = $existingNodes | Where-Object { $_.name -eq $r.name -or $_.address.value -eq $r.address } | Select-Object -First 1
    if ($hit) {
        Write-Host "Resource OK : $($r.name)"
        continue
    }
    $c = Invoke-Tg -Query 'mutation($name: String!, $address: String!, $remoteNetworkId: ID!, $groupIds: [ID!]) { resourceCreate(name: $name, address: $address, remoteNetworkId: $remoteNetworkId, groupIds: $groupIds) { error entity { id name } } }' -Variables @{
        name = $r.name; address = $r.address; remoteNetworkId = $net.id; groupIds = @($group.id)
    }
    if ($c.resourceCreate.error) { throw $c.resourceCreate.error }
    Write-Host "Resource créée : $($r.name)"
}

Write-Host @"

OK. Suite :
  1. scp docker-compose.yml + connector.env → NUC /opt/jarvis/twingate/
  2. ssh NUC → cd /opt/jarvis/twingate && docker compose up -d
  (commandes dans deploy\twingate\README.md)

"@
