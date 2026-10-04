@echo off
setlocal EnableExtensions
cd /d "%~dp0.."
if not exist "data" mkdir "data"

echo =========================================================
echo ASTRA CORE
echo =========================================================
echo ROOT: %CD%
echo.

echo ASTRA CORE STARTUP > "data\startup.log"
echo ROOT=%CD% >> "data\startup.log"
echo TIME=%date% %time% >> "data\startup.log"

if not exist ".venv\Scripts\python.exe" (
  echo ERROR: .venv\Scripts\python.exe not found.
  echo ERROR: Python environment is missing. >> "data\startup.log"
  goto fail
)

echo Starting FastAPI core...
"%CD%\.venv\Scripts\python.exe" -m app.main >> "data\startup.log" 2>&1
set "RC=%errorlevel%"

if "%RC%"=="0" goto clean_exit

echo.
echo ASTRA CORE STOPPED WITH ERROR CODE %RC%.
echo See: %CD%\data\startup.log
goto fail

:fail
echo.
echo =========================================================
echo ASTRA CORE FAILED
echo =========================================================
if exist "data\startup.log" (
  echo.
  type "data\startup.log"
)
echo.
echo This window is intentionally kept open for diagnostics.
pause
exit /b 1

:clean_exit
exit /b 0
