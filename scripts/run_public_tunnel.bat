@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0.."

set "PORT=8080"
set "HOSTNAME="
set "TOKEN="
if exist ".env" (
  for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"PORT=" ".env" 2^>nul') do set "PORT=%%B"
  for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"PUBLIC_HOSTNAME=" ".env" 2^>nul') do set "HOSTNAME=%%B"
  for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"CLOUDFLARE_TUNNEL_TOKEN=" ".env" 2^>nul') do set "TOKEN=%%B"
)

if not exist "data" mkdir "data"

if defined HOSTNAME if defined TOKEN goto stable

:quick_loop
echo [%date% %time%] Starting Quick Tunnel on port !PORT!>>"data\tunnel.log"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$log='data\tunnel.log';$urlFile='data\public-url.txt';& '.\cloudflared\cloudflared.exe' tunnel --url ('http://127.0.0.1:'+ $env:PORT) 2>&1 | ForEach-Object { $line=[string]$_; Add-Content -LiteralPath $log -Value $line; Write-Host $line; if($line -match 'https://[a-z0-9-]+\.trycloudflare\.com'){Set-Content -LiteralPath $urlFile -Value $matches[0] -Encoding utf8} }"
timeout /t 3 /nobreak >nul
goto quick_loop

:stable
> "data\public-url.txt" echo https://!HOSTNAME!
:stable_loop
echo [%date% %time%] Starting named Tunnel !HOSTNAME!>>"data\tunnel.log"
".\cloudflared\cloudflared.exe" tunnel run --token "!TOKEN!" >>"data\tunnel.log" 2>&1
echo [%date% %time%] cloudflared stopped; restarting in 5 seconds.>>"data\tunnel.log"
timeout /t 5 /nobreak >nul
goto stable_loop
