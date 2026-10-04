param([Parameter(Mandatory=$true)][string]$TunnelToken)
$ErrorActionPreference="Stop"
$dir="C:\Cloudflared\bin"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$exe=Join-Path $dir "cloudflared.exe"
if(-not (Test-Path $exe)){Write-Host "cloudflared.exe bulunamadi: $exe"; exit 1}
& $exe service install $TunnelToken
sc.exe start cloudflared
Get-Service cloudflared
