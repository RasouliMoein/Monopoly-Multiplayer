@echo off
echo ========================================================
echo   Starting Dedicated Monopoly Server
echo ========================================================
echo.

echo Building frontend (React)...
call npm run build
if %errorlevel% neq 0 (
    echo Frontend build failed! Aborting.
    pause
    exit /b 1
)

echo Building backend...
call npm run build:backend
if %errorlevel% neq 0 (
    echo Backend build failed! Aborting.
    pause
    exit /b 1
)

echo Starting Server...
node dist-backend/index.js
pause
