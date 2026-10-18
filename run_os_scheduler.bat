@echo off
title SmartTraffic - OS Traffic Scheduler
echo.
echo ==============================================
echo   SmartTraffic - OS Scheduling Engine
echo   Graphic Era University - Sem V PBL
echo   Team: Kshitij, Abhay, Abhyudaya
echo ==============================================
echo.

if not exist "%~dp0c_engine\bin\traffic_engine.exe" (
    echo [Info] Binary not found. Compiling first...
    call "%~dp0compile_engine.bat"
)

"%~dp0c_engine\bin\traffic_engine.exe"
pause
