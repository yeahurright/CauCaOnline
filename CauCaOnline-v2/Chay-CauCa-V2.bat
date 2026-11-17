@echo off
setlocal
title Cau Ca V2 (ban Adam bua da khoi phuc)
set "APPDIR=D:\5 caucavancan\CauCaOnline-v2\_internal\app"
set "NODE=%APPDIR%\runtime\node.exe"

if not exist "%NODE%" (
  echo Khong tim thay Node: %NODE%
  pause
  exit /b 1
)

curl.exe --silent --fail --max-time 2 http://127.0.0.1:3001/api/state >nul 2>&1
if not errorlevel 1 (
  echo Ban V2 da chay tai http://localhost:3001
  exit /b 0
)

netstat -ano | findstr /R /C:":3001 .*LISTENING" >nul
if not errorlevel 1 (
  echo Cong 3001 dang duoc tien trinh khac su dung. Khong tat tien trinh do.
  echo Hay dong dung app cu hoac lien he de kiem tra PID.
  pause
  exit /b 2
)

echo Dang khoi dong V2 Adam bua va Cloudflare Tunnel...
start "CauCaV2" /min /D "%APPDIR%" "%NODE%" server.js --cloudflare
for /L %%i in (1,1,40) do (
  curl.exe --silent --fail --max-time 2 http://127.0.0.1:3001/api/state >nul 2>&1
  if not errorlevel 1 goto ready
  timeout /t 1 /nobreak >nul
)

echo Server chua san sang sau 40 giay. Kiem tra cua so CauCaV2 va nhat ky server.
pause
exit /b 3

:ready
echo V2 dang chay tai http://localhost:3001
echo Link HTTPS se xuat hien tren man hinh V2 khi Cloudflare san sang.
echo Mo LIVE Studio, thay link OBS browser source roi bam Ket noi TikTok.
exit /b 0
