@echo off
cd /d "%~dp0.."
if not exist ".venv\Scripts\python.exe" (
  echo .venv yok. Once py -3 -m venv .venv ve pip install -r requirements.txt calistirin.
  exit /b 1
)
".venv\Scripts\python.exe" -m app.main
