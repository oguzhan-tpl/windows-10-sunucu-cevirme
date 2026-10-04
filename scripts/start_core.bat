@echo off
setlocal
cd /d "%~dp0.."
if not exist "data" mkdir "data"
echo ASTRA CORE STARTUP > "data\startup.log"
echo ROOT=%CD% >> "data\startup.log"
"%CD%\.venv\Scripts\python.exe" -m app.main >> "data\startup.log" 2>&1
exit /b %errorlevel%
