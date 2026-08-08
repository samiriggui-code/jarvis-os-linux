$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\..\core")
python -m jarvis_core._smoke_phase3
