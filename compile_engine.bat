@echo off
echo ============================================================
echo  SmartTraffic C Engine Compiler
echo  Team OSDBMS-V-2026-T217
echo ============================================================
echo.

set "ENGINE_DIR=%~dp0c_engine"
set "OUT=%~dp0c_engine\bin\traffic_engine.exe"

echo Compiling C engine...
gcc -Wall -O2 -o "%OUT%" "%ENGINE_DIR%\main.c" "%ENGINE_DIR%\scheduler.c" "%ENGINE_DIR%\sync_sim.c"

if %ERRORLEVEL% == 0 (
    echo.
    echo [SUCCESS] Compiled: %OUT%
    echo.
    "%OUT%" --test-sync
) else (
    echo.
    echo [FAILED] Compilation failed. Ensure MinGW gcc is on PATH.
    exit /b 1
)
