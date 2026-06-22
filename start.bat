@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================================
echo   🎲 Monopoly Multiplayer - Startup Launcher 🎲
echo ========================================================
echo.

:: Check Node.js installation
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH!
    echo Please install Node.js from https://nodejs.org/ and try again.
    pause
    exit /b 1
)

:: Check NPM installation
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] NPM is not installed or not in your PATH!
    pause
    exit /b 1
)

:: Auto-setup environment config
if not exist .env (
    echo [INFO] .env file not found. Copying .env.example...
    copy .env.example .env >nul
    if %errorlevel% neq 0 (
        echo [WARNING] Failed to copy .env.example to .env automatically.
    ) else (
        echo [SUCCESS] Created default .env configuration.
    )
)

:: Auto-install dependencies
if not exist node_modules (
    echo [INFO] node_modules directory not found. Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies!
        pause
        exit /b 1
    )
    echo [SUCCESS] Dependencies installed successfully.
)

:: Build React Frontend
echo [INFO] Compiling React Frontend...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend compilation failed!
    pause
    exit /b 1
)
echo [SUCCESS] Frontend compiled.

:: Build backend
echo [INFO] Compiling Backend...
call npm run build:backend
if %errorlevel% neq 0 (
    echo [ERROR] Backend compilation failed!
    pause
    exit /b 1
)
echo [SUCCESS] Backend compiled.

echo.
echo ========================================================
echo   🚀 Starting Dedicated Monopoly Server...
echo   Open your browser at http://localhost:3064
echo ========================================================
echo.

node dist-backend/src/server/src/index.js
if %errorlevel% neq 0 (
    echo [ERROR] Server crashed or stopped with error code %errorlevel%.
)
pause

