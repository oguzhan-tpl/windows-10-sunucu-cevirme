@echo off
setlocal EnableExtensions
cd /d "%~dp0.."
title ASTRA SERVER - Kurulum ve Baslat

echo.
echo  =========================================
echo       ASTRA SERVER - TEK TIK KURULUM
echo  =========================================
echo.

where py >nul 2>nul
if errorlevel 1 (
    echo [1/5] Python bulunamadi.
    where winget >nul 2>nul
    if errorlevel 1 (
        echo Winget bulunamiyor. Python 3.12+ kurup tekrar bu dosyayi calistirin.
        pause
        exit /b 1
    )
    echo Python kuruluyor...
    winget install -e --id Python.Python.3.13 --scope user --accept-source-agreements --accept-package-agreements
    if errorlevel 1 (
        echo Python kurulumu basarisiz.
        pause
        exit /b 1
    )
)

if not exist ".venv\Scripts\python.exe" (
    echo [2/5] Sanal Python ortami olusturuluyor...
    py -3 -m venv .venv
    if errorlevel 1 goto :fail
)

echo [3/5] Python paketleri kuruluyor...
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto :fail

if not exist ".env" (
    echo [4/5] Ilk konfigurasyon olusturuluyor...
    for /f "delims=" %%S in ('py -c "import secrets; print(secrets.token_urlsafe(48))"') do set "SECRET=%%S"
    >".env" (
      echo APP_NAME=Astra Server
      echo HOST=127.0.0.1
      echo PORT=8080
      echo SERVER_SECRET=%SECRET%
      echo COOKIE_SECURE=false
      echo SESSION_TTL_HOURS=24
      echo ALLOW_REGISTRATION=true
      echo BOOTSTRAP_ADMIN_USERNAME=admin
      echo BOOTSTRAP_ADMIN_PASSWORD=admin-%SECRET:~0,12%
      echo DATA_DIR=./data
      echo MEDIA_DIR=./data/media
      echo PROJECTS_DIR=./data/projects
      echo MAX_UPLOAD_MB=2048
      echo MAX_APP_UPLOAD_MB=128
      echo APP_MAX_COUNT=5
      echo APP_PROXY_BODY_MAX_MB=16
    )
    >"data\admin-credentials.txt" echo Kullanici: admin
    >>"data\admin-credentials.txt" echo Sifre: admin-%SECRET:~0,12%
) else (
    echo [4/5] Mevcut .env korunuyor.
)

echo [5/5] Astra baslatiliyor...
if not exist "data" mkdir data
start "ASTRA APP" /min cmd /c ""%CD%\.venv\Scripts\python.exe" -m app.main"
timeout /t 3 /nobreak >nul

echo.
echo Yerel servis: http://127.0.0.1:8080
echo.
call "%CD%\scripts\public_tunnel.bat"
exit /b 0

:fail
echo.
echo KURULUM BASARISIZ.
pause
exit /b 1
