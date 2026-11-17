@echo off
title Ho Ca - Restart Server
echo ============================================
echo   KHOI DONG LAI SERVER HO CA
echo ============================================
echo.
echo [1/3] Dang tat server cu (cong 3001)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 >nul
echo [2/3] Dang khoi dong server moi...
cd /d "D:\5 caucavancan\CauCaOnline\_internal\app"
start "HoCaServer" /min "D:\5 caucavancan\CauCaOnline\_internal\app\runtime\node.exe" "D:\5 caucavancan\CauCaOnline\_internal\app\server.js"
timeout /t 2 >nul
echo [3/3] Xong! Server chay tai http://localhost:3001
echo.
echo (Cua so "HoCaServer" dang thu nho - dung tat no khi dang live)
echo Cua so nay tu dong dong sau 4 giay...
timeout /t 4 >nul
exit
