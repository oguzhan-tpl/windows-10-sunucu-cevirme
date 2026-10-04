@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title ASTRA SERVER

echo =========================================================
echo ASTRA SERVER
echo ONE-CLICK INSTALL AND PUBLIC ACCESS
echo =========================================================
echo.
echo ROOT: %CD%
echo.

if not exist "requirements.txt" (
  echo ERROR: requirements.txt not found.
  echo Run KUR_VE_AC.bat from the repository root.
  echo.
  pause
  exit /b 1
)

where py >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python launcher "py" was not found.
  echo Install Python 3.12+ and run this file again.
  echo.
  pause
  exit /b 1
)

echo [1/6] Python environment...
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv ".venv"
  if errorlevel 1 goto fail
) else (
  echo Existing environment found.
)

echo.
echo [2/6] Installing packages...
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r "%CD%\requirements.txt"
if errorlevel 1 goto fail

echo.
echo [3/6] Preparing administrator account...

if not exist "data" mkdir "data"

set "PASS="
if exist ".env" (
  for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"BOOTSTRAP_ADMIN_PASSWORD=" ".env" 2^>nul') do set "PASS=%%B"
)

if not defined PASS (
  echo Generating a new administrator password...
  for /f "delims=" %%P in ('py -3 -c "import secrets; print('Astra-'+secrets.token_urlsafe(12))"') do set "PASS=%%P"
)

if not defined PASS (
  echo ERROR: Could not create administrator password.
  goto fail
)

if not exist ".env" (
  for /f "delims=" %%S in ('py -3 -c "import secrets; print(secrets.token_urlsafe(48))"') do set "SECRET=%%S"
  if not defined SECRET goto fail

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
  ) > ".env"
) else (
  set "ASTRA_PASS=!PASS!"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='.env';$lines=@(Get-Content -LiteralPath $f -ErrorAction Stop);$found=$false;$out=foreach($line in $lines){if($line -match '^BOOTSTRAP_ADMIN_PASSWORD='){ $found=$true; 'BOOTSTRAP_ADMIN_PASSWORD='+$env:ASTRA_PASS } else { $line }};if(-not $found){$out += 'BOOTSTRAP_ADMIN_PASSWORD='+$env:ASTRA_PASS};Set-Content -LiteralPath $f -Value $out -Encoding utf8"
  if errorlevel 1 goto fail
)

set "ASTRA_ADMIN_PASSWORD=!PASS!"
".venv\Scripts\python.exe" -c "import os; from app.db import init_db,set_user_password; init_db(); set_user_password('admin', os.environ['ASTRA_ADMIN_PASSWORD'])"
if errorlevel 1 goto fail

(
  echo Astra Server administrator credentials
  echo Username=admin
  echo Password=!PASS!
) > "data\admin-credentials.txt"

echo.
echo ---------------------------------------------------------
echo ADMIN LOGIN
echo Username : admin
echo Password : !PASS!
echo Credentials file: %CD%\data\admin-credentials.txt
echo ---------------------------------------------------------
echo.

echo [4/6] Installing Cloudflare Tunnel...
powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\install_cloudflared.ps1"
if errorlevel 1 goto fail

echo.
echo [5/6] Starting Astra core...
start "ASTRA SERVER" /min cmd /c ""%CD%\.venv\Scripts\python.exe" -m app.main"

set "READY=0"
for /l %%T in (1,1,20) do (
  powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080/healthz -TimeoutSec 2; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 (
    set "READY=1"
    goto server_ready
  )
  timeout /t 1 /nobreak >nul
)

:server_ready
if "!READY!"=="0" (
  echo ERROR: Astra did not become ready on 127.0.0.1:8080.
  echo Open the ASTRA SERVER window and check the error.
  echo.
  if exist "data\startup.log" type "data\startup.log"
  goto fail
)

echo Astra core is ONLINE.

echo.
echo [6/6] Starting public access...
start "ASTRA PUBLIC" cmd /c ""%CD%\PUBLIC_AC.bat""
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8080"

echo.
echo =========================================================
echo ASTRA IS RUNNING
echo =========================================================
echo ADMIN USER : admin
echo ADMIN PASS : !PASS!
echo LOCAL      : http://127.0.0.1:8080
echo PUBLIC URL : See the ASTRA PUBLIC window.
echo.
echo Keep ASTRA SERVER and ASTRA PUBLIC windows running.
echo =========================================================
echo.
pause
exit /b 0

:fail
echo.
echo =========================================================
echo INSTALLATION FAILED
echo =========================================================
pause
exit /b 1
