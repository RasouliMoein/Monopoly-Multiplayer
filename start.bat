@echo off
echo ========================================================
echo   Starting Dedicated Monopoly Server
echo ========================================================
echo.
echo Please note: If you have made changes to the React code, 
echo you may want to run "npm run build" first.
echo.
echo Building node backend...
call npm run build:backend

echo Starting Server...
node dist-backend/index.js
pause
