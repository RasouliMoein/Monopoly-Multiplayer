@echo off
echo ========================================================
echo   Building and Starting Monopoly
echo ========================================================
echo.
echo Compiling Frontend (React)...
call npm run build

echo.
echo Compiling Backend (Node.js)...
call npm run build:backend

echo.
echo Starting Server...
echo The game will be available at http://localhost:3064
echo.
node dist-backend/src/server/src/index.js
pause
