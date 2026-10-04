@echo off
setlocal
if "%~2"=="" (
  echo Kullanım: run_project.bat PROJE_SLUG PORT
  exit /b 1
)
cd /d "%~dp0..\data\projects\%~1\app"
py -3 -m uvicorn main:app --host 127.0.0.1 --port %~2
