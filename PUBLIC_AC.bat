@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title ASTRA PUBLIC - CLOUDFLARE TUNNEL

if not exist "cloudflared\cloudflared.exe" (
  echo ERROR: cloudflared.exe not found.
  exit /b 1
)

set "PORT=8080"
set "HOSTNAME="
set "TOKEN="
set "TUNNEL_NAME=sunucumon"
if exist ".env" (
  for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"PORT=" ".env" 2^>nul') do set "PORT=%%B"
  for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"PUBLIC_HOSTNAME=" ".env" 2^>nul') do set "HOSTNAME=%%B"
  for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"CLOUDFLARE_TUNNEL_TOKEN=" ".env" 2^>nul') do set "TOKEN=%%B"
  for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"CLOUDFLARE_TUNNEL_NAME=" ".env" 2^>nul') do set "TUNNEL_NAME=%%B"
)

if /I "!TOKEN!"=="replace-with-cloudflare-tunnel-token" set "TOKEN="
if /I "!HOSTNAME!"=="sunucum.example.com" set "HOSTNAME="

if not exist "data" mkdir "data"
del /q "data\tunnel.log" >nul 2>nul
del /q "data\public-url.txt" >nul 2>nul

echo =========================================================
echo ASTRA PUBLIC ACCESS
echo =========================================================
echo.
echo Router port forwarding: NOT REQUIRED
echo Local target: http://127.0.0.1:!PORT!
echo Tunnel: !TUNNEL_NAME!
echo.

if defined HOSTNAME if defined TOKEN goto stable

echo STABLE MODE: CONFIGURE EDILMEMIS
echo Temporary Quick Tunnel is being started.
echo Its trycloudflare.com address may change after restart.
echo.

start "ASTRA PUBLIC TUNNEL" /min "%ComSpec%" /c call "%CD%\scripts\run_public_tunnel.bat"
for /l %%T in (1,1,20) do (
  if exist "data\public-url.txt" (
    set /p PUBLIC_URL=<"data\public-url.txt"
    if defined PUBLIC_URL goto ready
  )
  timeout /t 1 /nobreak >nul
)
echo Public tunnel was not ready in time. Check data\tunnel.log.
exit /b 1

:stable
> "data\public-url.txt" echo https://!HOSTNAME!
echo STABLE MODE: ENABLED
echo Tunnel name: !TUNNEL_NAME!
echo Public hostname: !HOSTNAME!
echo Permanent URL:
echo https://!HOSTNAME!
echo.
echo Checking public health endpoint...
start "ASTRA PUBLIC TUNNEL" /min "%ComSpec%" /c call "%CD%\scripts\run_public_tunnel.bat"
for /l %%T in (1,1,20) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'https://!HOSTNAME!/healthz' -TimeoutSec 2; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 goto ready
  timeout /t 1 /nobreak >nul
)
echo Tunnel process is running, but the public hostname did not pass /healthz.
echo Verify the Cloudflare Published Application points to http://127.0.0.1:!PORT!.
exit /b 1

:ready
echo.
echo =========================================================
echo PUBLIC URL READY
echo !PUBLIC_URL!
echo =========================================================
exit /b 0
