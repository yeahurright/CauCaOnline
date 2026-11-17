@echo off
setlocal
set "APPDIR=%~dp0_internal\app"
set "NODE=%APPDIR%\runtime\node.exe"
set "PORT=3023"

curl.exe -fsS --max-time 2 http://127.0.0.1:%PORT%/api/state 2>nul | findstr /L /C:"demo:player" >nul
if not errorlevel 1 goto ready
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo Cong %PORT% dang duoc ung dung khac su dung.
  exit /b 2
)
start "Ho Cau Chay Thu" /min /D "%APPDIR%" "%NODE%" server.js --demo
for /L %%I in (1,1,30) do (
  curl.exe -fsS --max-time 2 http://127.0.0.1:%PORT%/api/state 2>nul | findstr /L /C:"demo:player" >nul
  if not errorlevel 1 goto ready
  timeout /t 1 /nobreak >nul
)
echo Chua mo duoc ho cau thu.
exit /b 1

:ready
start "" "http://127.0.0.1:%PORT%/"
