@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title ASTRA SERVER

echo =========================================================
echo ASTRA SERVER
echo ONE-CLICK INSTALL AND PUBLIC ACCESS
echo =========================================================
echo ROOT: %CD%
echo.

if not exist "requirements.txt" goto error_root

where py >nul 2>nul
if errorlevel 1 goto error_python

echo [1/6] Python environment...
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv ".venv"
  if errorlevel 1 goto error_venv
) else (
  echo Python environment: OK
)

echo.
echo [2/6] Installing packages...
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r "%CD%\requirements.txt"
if errorlevel 1 goto error_pip

echo.
echo [3/6] Preparing administrator account...
if not exist "data" mkdir "data"
set "PASS="

if exist ".env" (
  for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"BOOTSTRAP_ADMIN_PASSWORD=" ".env" 2^>nul') do set "PASS=%%B"
)

if not defined PASS (
  echo Generating administrator password...
  for /f "delims=" %%P in ('py -3 -c "import secrets; print('Astra-'+secrets.token_urlsafe(12))"') do set "PASS=%%P"
)

if not defined PASS goto error_password

if not exist ".env" (
  for /f "delims=" %%S in ('py -3 -c "import secrets; print(secrets.token_urlsafe(48))"') do set "SECRET=%%S"
  if not defined SECRET goto error_secret
  (
    echo APP_NAME=Astra Server
    echo HOST=127.0.0.1
    echo PORT=8080
    echo SERVER_SECRET=!SECRET!
    echo COOKIE_SECURE=false
    echo SESSION_TTL_HOURS=720
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
)

set "ASTRA_ADMIN_PASSWORD=!PASS!"
".venv\Scripts\python.exe" -c "import os; from app.db import init_db,set_user_password; init_db(); set_user_password('admin', os.environ['ASTRA_ADMIN_PASSWORD'])"
if errorlevel 1 goto error_database

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
echo Credentials: %CD%\data\admin-credentials.txt
echo ---------------------------------------------------------
echo.

echo [4/6] Checking Cloudflare Tunnel...
powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\install_cloudflared.ps1"
if errorlevel 1 goto error_cloudflare

echo.
echo [5/6] Testing Astra startup...
".venv\Scripts\python.exe" -c "from fastapi.testclient import TestClient; from app.main import app; c=TestClient(app); c.__enter__(); r=c.get('/healthz'); print('Startup check:',r.status_code,r.json()); c.__exit__(None,None,None); raise SystemExit(0 if r.status_code==200 and r.json().get('ok') else 1)"
if errorlevel 1 goto error_startup

echo.
echo [6/7] Preparing listening port...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$root=(Resolve-Path '.').Path; $conns=Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue; foreach($c in $conns){$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$c.OwningProcess) -ErrorAction SilentlyContinue; if($p -and $p.CommandLine -like ('*'+$root+'*app.main*')){Write-Host ('Stopping old Astra process PID '+$c.OwningProcess); Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue}}"
timeout /t 1 /nobreak >nul

for /f "delims=" %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports=8080..8099; foreach($p in $ports){if(-not (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)){Write-Output $p; break}}"') do set "ASTRA_PORT=%%P"
if not defined ASTRA_PORT goto error_port
set "PORT=!ASTRA_PORT!"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='.env';$lines=@(Get-Content -LiteralPath $f -ErrorAction Stop);$found=$false;$out=foreach($line in $lines){if($line -match '^PORT='){ $found=$true; 'PORT='+$env:PORT } else { $line }};if(-not $found){$out += 'PORT='+$env:PORT};Set-Content -LiteralPath $f -Value $out -Encoding utf8"
if errorlevel 1 goto error_port
echo Astra will use localhost port !ASTRA_PORT!.

echo.
echo [7/7] Starting Astra core...
if exist "data\startup.log" del /q "data\startup.log" >nul 2>nul
start "ASTRA SERVER" /min "%ComSpec%" /c call "%CD%\scripts\start_core.bat"

set "READY=0"
for /l %%T in (1,1,20) do (
  powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:!ASTRA_PORT!/healthz -TimeoutSec 2; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 (
    set "READY=1"
    goto core_ready
  )
  timeout /t 1 /nobreak >nul
)

goto error_core

:core_ready
echo Astra core is ONLINE.

echo.
echo [6/6] Starting public access...
start "ASTRA PUBLIC" /min "%ComSpec%" /c call "%CD%\PUBLIC_AC.bat"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8080"

echo.
echo =========================================================
echo ASTRA IS RUNNING
echo =========================================================
echo ADMIN USER : admin
echo ADMIN PASS : !PASS!
echo LOCAL      : http://127.0.0.1:!ASTRA_PORT!
echo PUBLIC URL : ASTRA PUBLIC window / data\public-url.txt
echo =========================================================
echo.
pause
exit /b 0

:error_root
echo ERROR: requirements.txt not found.
goto failure

:error_python
echo ERROR: Python launcher "py" not found. Install Python 3.12+.
goto failure

:error_venv
echo ERROR: Python virtual environment could not be created.
goto failure

:error_pip
echo ERROR: Python packages could not be installed.
goto failure

:error_password
echo ERROR: Administrator password could not be generated or read.
goto failure

:error_secret
echo ERROR: SERVER_SECRET could not be generated.
goto failure

:error_database
echo ERROR: Database initialization or administrator account setup failed.
goto show_log

:error_cloudflare
echo ERROR: Cloudflare Tunnel setup failed.
goto failure

:error_startup
echo ERROR: Astra startup lifecycle test failed.
goto failure

:error_core
echo ERROR: Astra did not become ready on 127.0.0.1:!ASTRA_PORT!.
goto show_log

:error_port
echo ERROR: Port 8080 is occupied by another program.
echo Close that program and run KUR_VE_AC.bat again.
goto show_log


:show_log
echo.
echo =========================================================
echo ASTRA DIAGNOSTIC LOG
echo =========================================================
if exist "data\startup.log" (
  type "data\startup.log"
) else (
  echo No startup.log was created.
)
echo =========================================================

:failure
echo.
echo =========================================================
echo INSTALLATION FAILED
echo =========================================================
pause
exit /b 1
