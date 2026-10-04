@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title ASTRA PUBLIC - CLOUDFLARE TUNNEL

if not exist "cloudflared\cloudflared.exe" (
  echo ERROR: cloudflared.exe not found.
  pause
  exit /b 1
)

set "PORT=8080"
set "HOSTNAME="
set "TOKEN="
if exist ".env" (
  for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"PORT=" ".env" 2^>nul') do set "PORT=%%B"
  for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"PUBLIC_HOSTNAME=" ".env" 2^>nul') do set "HOSTNAME=%%B"
  for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"CLOUDFLARE_TUNNEL_TOKEN=" ".env" 2^>nul') do set "TOKEN=%%B"
)

if not exist "data" mkdir "data"
del /q "data\public-url.txt" >nul 2>nul
del /q "data\tunnel.log" >nul 2>nul

echo =========================================================
echo ASTRA PUBLIC ACCESS
echo =========================================================
echo.
echo Router port forwarding: NOT REQUIRED
echo Local target: http://127.0.0.1:!PORT!
echo.

if defined HOSTNAME if defined TOKEN goto named_tunnel

echo STABLE MODE: NOT CONFIGURED
echo A named Cloudflare Tunnel requires PUBLIC_HOSTNAME and
echo CLOUDFLARE_TUNNEL_TOKEN in .env.
echo Falling back to temporary Quick Tunnel.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$log='data\tunnel.log';$urlFile='data\public-url.txt';& '.\cloudflared\cloudflared.exe' tunnel --url ('http://127.0.0.1:'+ $env:PORT) 2>&1 | ForEach-Object { $line=[string]$_; Add-Content -LiteralPath $log -Value $line; Write-Host $line; if($line -match 'https://[a-z0-9-]+\.trycloudflare\.com'){ $url=$matches[0]; Set-Content -LiteralPath $urlFile -Value $url -Encoding utf8; Write-Host ''; Write-Host ('PUBLIC URL : '+$url) } }"
goto stopped

:named_tunnel
echo STABLE MODE: ENABLED
echo Public hostname: !HOSTNAME!
echo Tunnel name: sunucumon
> "data\public-url.txt" echo https://!HOSTNAME!
echo.
echo =========================================================
echo PERMANENT PUBLIC URL
echo https://!HOSTNAME!
echo =========================================================
echo.
echo Starting named Cloudflare Tunnel...
".\cloudflared\cloudflared.exe" tunnel run --token "!TOKEN!" >> "data\tunnel.log" 2>&1

:stopped
echo.
echo Tunnel stopped.
pause
exit /b 0
