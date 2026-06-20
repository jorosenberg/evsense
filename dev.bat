@echo off
setlocal

set "NODE=C:\Program Files\nodejs\node.exe"
set "FRONTEND=%~dp0frontend"

:: ── Check Node v24 is available ─────────────────────────────────
if not exist "%NODE%" (
    echo ERROR: Node not found at "%NODE%"
    echo Please install Node.js v24 from https://nodejs.org
    pause
    exit /b 1
)

:: ── Install dependencies if needed ───────────────────────────────
cd /d "%FRONTEND%"
if not exist node_modules (
    echo Installing frontend dependencies...
    "%NODE%" "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install
    if errorlevel 1 (
        echo npm install failed. Try running it manually in the frontend\ folder.
        pause
        exit /b 1
    )
)

:: ── Start Vite dev server and open browser ────────────────────────
echo.
echo  EVsense dev server starting...
echo  Local: http://localhost:5173
echo  Press Ctrl+C to stop.
echo.

"%NODE%" "node_modules\vite\bin\vite.js" --open

endlocal
