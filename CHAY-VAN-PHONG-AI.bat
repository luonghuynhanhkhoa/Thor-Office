@echo off
setlocal EnableExtensions
title Van phong AI - Thor
set "PATH=%PATH%;C:\Program Files\nodejs"
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Node. Cai bang: winget install OpenJS.NodeJS.LTS
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Lan dau chay: dang cai thu vien, cho 1-3 phut...
  call npm install
  if errorlevel 1 (
    echo [LOI] npm install bi loi.
    pause
    exit /b 1
  )
)

echo.
echo Dang mo Van phong AI o http://localhost:3300 ...
echo (Dong cua so nay de TAT van phong AI.)
echo.
start "" /min cmd /c "ping -n 8 127.0.0.1 >nul & start http://localhost:3300"
call npm run dev -- -p 3300
pause
