@echo off
echo ============================================================
echo  SmartTraffic C Engine Compiler
echo  Team: Kshitij, Abhay, Abhyudaya (Graphic Era)
echo ============================================================
echo.

set "ENGINE_DIR=%~dp0c_engine"
set "OUT=%~dp0c_engine\bin\traffic_engine.exe"

echo Compiling C scheduling engine...
gcc -Wall -O2 -o "%OUT%" "%ENGINE_DIR%\main.c" "%ENGINE_DIR%\scheduler.c" "%ENGINE_DIR%\sync_sim.c"

if %ERRORLEVEL% == 0 (
    echo.
    echo [OK] Compiled successfully: %OUT%
    echo.
    "%OUT%" --sync
) else (
    echo.
    echo [ERROR] Compilation failed. Ensure MinGW gcc is on PATH.
    exit /b 1
)
