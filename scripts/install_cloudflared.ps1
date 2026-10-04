$ErrorActionPreference="Stop"
$dir=Join-Path $PSScriptRoot "..\cloudflared"
$dir=[IO.Path]::GetFullPath($dir)
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$exe=Join-Path $dir "cloudflared.exe"
if(-not (Test-Path $exe)){
  $url="https://github.com/cloudflare/cloudflared/releases/download/2026.9.3/cloudflared-windows-amd64.exe"
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $exe
}
Write-Host "cloudflared hazir: $exe"
