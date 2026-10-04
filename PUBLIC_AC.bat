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
if exist ".env" (
  for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"PORT=" ".env" 2^>nul') do set "PORT=%%B"
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
echo Waiting for Cloudflare public address...
echo Keep this window open while public access is needed.
echo ---------------------------------------------------------

powershell -NoProfile -ExecutionPolicy Bypass -Command "$log='data\tunnel.log';$urlFile='data\public-url.txt';& '.\cloudflared\cloudflared.exe' tunnel --url ('http://127.0.0.1:'+ $env:PORT) 2>&1 | ForEach-Object { $line=[string]$_; Add-Content -LiteralPath $log -Value $line; Write-Host $line; if($line -match 'https://[a-z0-9-]+\.trycloudflare\.com'){ $url=$matches[0]; Set-Content -LiteralPath $urlFile -Value $url -Encoding utf8; Write-Host ''; Write-Host '========================================================='; Write-Host ('PUBLIC URL : '+$url); Write-Host '=========================================================' } }"

echo.
echo Tunnel stopped.
pause
exit /b 0
