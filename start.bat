@echo off
chcp 936 >nul
title MiMo Agent Launcher

cd /d "%~dp0"

echo.
echo ============================================
echo    MiMo Agent Local Executor
echo ============================================
echo.
echo Starting service on port 9527...
echo.

REM Start Node.js service
start "MiMo Agent" node server.js

REM Wait for service to start
timeout /t 3 /nobreak >nul

REM Open browser
echo Opening browser...
start "" "https://aistudio.xiaomimimo.com/#/c"

echo.
echo ============================================
echo    Service started!
echo    Browser opened!
echo ============================================
echo.
echo This window will close automatically in 3 seconds...
timeout /t 3 /nobreak >nul
exit
