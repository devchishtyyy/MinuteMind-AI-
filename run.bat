@echo off
title MinuteMind AI
cd /d "%~dp0"

echo.
echo  Starting MinuteMind AI...
echo.

if not exist "%~dp0backend\.env" (
    echo  ERROR: backend\.env is missing.
    echo  Copy backend\.env.example to backend\.env and set GEMINI_API_KEY first.
    echo.
    pause
    exit /b 1
)

REM Use bundled node.exe if present, otherwise fall back to system node
if exist "%~dp0node.exe" (
    set "NODE_EXE=%~dp0node.exe"
) else (
    set "NODE_EXE=node"
)

REM Set production environment
set NODE_ENV=production

REM Open browser after a short delay (2 seconds)
start "" cmd /c "timeout /t 2 >nul && start http://localhost:4001"

REM Start the server (this blocks until closed)
"%NODE_EXE%" backend\server.js

echo.
echo  Server stopped. Press any key to exit.
pause >nul
