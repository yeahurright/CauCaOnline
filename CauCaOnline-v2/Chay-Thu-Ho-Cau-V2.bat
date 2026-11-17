@echo off
setlocal
title Ho Cau - Chay thu V2
set "PORT=3031"
set "APPDIR=%~dp0_internal\bay-preview"
set "NODE=%APPDIR%\runtime\node.exe"
set "DEMO_URL=http://127.0.0.1:%PORT%/?sound=1&controls=demo"
call :ready
if not errorlevel 1 goto open
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo Cong %PORT% dang ban. Dong cua so ban thu cu roi chay lai.
  pause
  exit /b 2
)
start "Ho Cau Chay Thu V2" /min /D "%APPDIR%" "%NODE%" server.js --demo
for /L %%I in (1,1,30) do (
  call :ready
  if not errorlevel 1 goto open
  ping.exe -n 2 127.0.0.1 >nul
)
echo Chua khoi dong duoc ban thu V2.
pause
exit /b 1

:open
start "" "%DEMO_URL%"
exit /b 0

:ready
curl.exe -fsS --max-time 2 -D - -o NUL http://127.0.0.1:%PORT%/api/state 2>nul | findstr /I /L /C:"X-CauCa-Preview: v2-voice-sync" >nul
exit /b %errorlevel%
