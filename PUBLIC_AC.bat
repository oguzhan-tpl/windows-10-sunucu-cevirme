@echo off
cd /d "%~dp0"
if not exist "cloudflared\cloudflared.exe" (
  echo cloudflared.exe bulunamadi.
  echo Cloudflare Tunnel kurulumunu once yapin.
  pause
  exit /b 1
)
echo Astra public tunnel baslatiliyor...
echo Modem portu acilmaz.
"cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:8080
