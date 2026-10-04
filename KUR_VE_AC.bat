@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title ASTRA SERVER

echo =========================================
echo ASTRA SERVER - TEK TIK KURULUM
echo =========================================
echo.
echo Calisma klasoru: %CD%
echo.

if not exist "requirements.txt" (
  echo HATA: requirements.txt bulunamadi.
  echo Bu dosyayi repo ana klasorundeki KUR_VE_AC.bat ile calistir.
  echo.
  pause
  exit /b 1
)

where py >nul 2>nul
if errorlevel 1 (
  echo Python 3 bulunamadi.
  echo Python 3.12+ kurduktan sonra bu dosyayi tekrar ac.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo [1/4] Python ortami hazirlaniyor...
  py -3 -m venv .venv
  if errorlevel 1 goto fail
) else (
  echo [1/4] Mevcut Python ortami kullaniliyor.
)

echo [2/4] Paketler hazirlaniyor...
".venv\Scripts\python.exe" -m pip install -r "%CD%\requirements.txt"
if errorlevel 1 goto fail

if not exist ".env" (
  echo [3/4] Ilk ayarlar hazirlaniyor...
  for /f "delims=" %%S in ('".venv\Scripts\python.exe" -c "import secrets; print(secrets.token_urlsafe(48))"') do set "SECRET=%%S"
  for /f "delims=" %%P in ('".venv\Scripts\python.exe" -c "import secrets; print(secrets.token_urlsafe(10))"') do set "PASS=astra-%%P"
  (
    echo APP_NAME=Astra Server
    echo HOST=127.0.0.1
    echo PORT=8080
    echo SERVER_SECRET=!SECRET!
    echo COOKIE_SECURE=false
    echo SESSION_TTL_HOURS=24
    echo ALLOW_REGISTRATION=true
    echo BOOTSTRAP_ADMIN_USERNAME=admin
    echo BOOTSTRAP_ADMIN_PASSWORD=!PASS!
    echo DATA_DIR=./data
    echo MEDIA_DIR=./data/media
    echo PROJECTS_DIR=./data/projects
    echo MAX_UPLOAD_MB=2048
    echo MAX_APP_UPLOAD_MB=128
    echo APP_MAX_COUNT=5
    echo APP_PROXY_BODY_MAX_MB=16
  ) > .env
  if not exist data mkdir data
  (
    echo Astra Server ilk yonetici hesabi
    echo Kullanici: admin
    echo Sifre: !PASS!
  ) > data\admin-credentials.txt
) else (
  echo [3/4] Mevcut ayarlar korunuyor.
)

echo [4/4] Astra aciliyor...
start "ASTRA SERVER" /min cmd /c ""%CD%\.venv\Scripts\python.exe" -m app.main"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8080"
echo.
echo Astra acildi.
echo Admin bilgileri: data\admin-credentials.txt
echo.
pause
exit /b 0

:fail
echo.
echo Kurulum sirasinda hata olustu.
pause
exit /b 1
