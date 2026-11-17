@echo off
setlocal
set "APPDIR=%~dp0_internal\app"
set "NODE=%APPDIR%\runtime\node.exe"
if not exist "%NODE%" exit /b 1

call :ready
if not errorlevel 1 exit /b 0
netstat -ano | findstr /R /C:":3001 .*LISTENING" >nul
if not errorlevel 1 exit /b 2

set "PORT=3001"
start "HoCauChinh" /min /D "%APPDIR%" "%NODE%" server.js --cloudflare
for /L %%i in (1,1,40) do (
  call :ready
  if not errorlevel 1 exit /b 0
  ping.exe -n 2 127.0.0.1 >nul
)
exit /b 3

:ready
curl.exe --silent --fail --max-time 2 http://127.0.0.1:3001/ 2>nul | findstr /L /C:"BUILD:2026-11-17-pond-live-main-fees-music1" >nul
exit /b %errorlevel%
