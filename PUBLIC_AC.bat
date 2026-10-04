@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title ASTRA PUBLIC - CLOUDFLARE TUNNEL

if not exist "cloudflared\cloudflared.exe" (
  echo ERROR: cloudflared.exe not found.
  echo.
  pause
  exit /b 1
)

if not exist "data" mkdir "data"
del /q "data\public-url.txt" >nul 2>nul
del /q "data\tunnel.log" >nul 2>nul

echo =========================================================
echo ASTRA PUBLIC ACCESS
echo =========================================================
echo.
echo Router port forwarding: NOT REQUIRED
echo Local target: http://127.0.0.1:8080
echo.
echo Waiting for Cloudflare public address...
echo The address below is reachable from the Internet.
echo Keep this window open.
echo ---------------------------------------------------------

powershell -NoProfile -ExecutionPolicy Bypass -Command "$log='data\tunnel.log';$urlFile='data\public-url.txt';& '.\cloudflared\cloudflared.exe' tunnel --url 'http://127.0.0.1:8080' 2>&1 | ForEach-Object { $line=[string]$_; Add-Content -LiteralPath $log -Value $line; Write-Host $line; if($line -match 'https://[a-z0-9-]+\.trycloudflare\.com'){ $url=$matches[0]; Set-Content -LiteralPath $urlFile -Value $url -Encoding utf8; Write-Host ''; Write-Host '========================================================='; Write-Host ('PUBLIC URL : '+$url); Write-Host '=========================================================' } }"

echo.
echo Tunnel stopped.
pause
exit /b 0
