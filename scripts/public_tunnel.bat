@echo off
setlocal
cd /d "%~dp0.."
set "BIN=%CD%\cloudflared\cloudflared.exe"

if not exist "%BIN%" (
    echo Cloudflare Tunnel indiriliyor...
    if not exist "cloudflared" mkdir "cloudflared"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$u='https://github.com/cloudflare/cloudflared/releases/download/2026.9.3/cloudflared-windows-amd64.exe'; Invoke-WebRequest -UseBasicParsing -Uri $u -OutFile '%BIN%'"
    if errorlevel 1 (
        echo Cloudflare Tunnel indirilemedi.
        exit /b 1
    )
)

echo Cloudflare public tunnel baslatiliyor...
echo Bu mod modemden port acmaz.
echo.

if exist "cloudflared\tunnel-token.txt" (
    set /p TUNNEL_TOKEN=<"cloudflared\tunnel-token.txt"
    "%BIN%" tunnel run --token "%TUNNEL_TOKEN%"
) else (
    echo Kalici Tunnel tokeni yok; gecici public URL aciliyor.
    "%BIN%" tunnel --url http://127.0.0.1:8080
)
