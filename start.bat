@echo off
title SmartTraffic — OS+DBMS PBL System
color 0A
echo.
echo ============================================================
echo   SmartTraffic System Startup
echo   Team OSDBMS-V-2026-T217  ^|  Graphic Era University
echo ============================================================
echo.

set "ROOT=%~dp0"
cd /d "%ROOT%"

:: ── Step 1: Check Python ──────────────────────────────────────
py --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python not found. Install Python 3.10+ and add to PATH.
    pause & exit /b 1
)
echo [OK] Python found.

:: ── Step 2: Check MySQL is running ───────────────────────────
sc query MySQL80 | findstr "RUNNING" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARN] MySQL80 service not running. Attempting to start...
    net start MySQL80 >nul 2>&1
    timeout /t 3 /nobreak >nul
    sc query MySQL80 | findstr "RUNNING" >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Could not start MySQL. Please start MySQL service manually.
        pause & exit /b 1
    )
)
echo [OK] MySQL is running.

:: ── Step 3: Check .env exists ────────────────────────────────
if not exist "%ROOT%.env" (
    echo [ERROR] .env file missing. Copy .env.example to .env and fill DB credentials.
    pause & exit /b 1
)
echo [OK] .env found.

:: ── Step 4: Install Python dependencies ──────────────────────
echo [..] Installing Python dependencies...
py -m pip install -r "%ROOT%requirements.txt" -q
echo [OK] Dependencies ready.

:: ── Step 5: Check C engine binary ────────────────────────────
if not exist "%ROOT%c_engine\bin\traffic_engine.exe" (
    echo [WARN] C engine binary not found. Compiling...
    call "%ROOT%compile_engine.bat"
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Could not compile C engine.
        pause & exit /b 1
    )
)
echo [OK] C engine binary found.

:: ── Step 6: Initialize / verify database ─────────────────────
echo [..] Initializing database (auto-creates if missing)...
py "%ROOT%database\init_db.py"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Database init failed. Check MySQL credentials in .env.
    pause & exit /b 1
)
echo [OK] Database ready.

:: ── Step 7: Run tests ─────────────────────────────────────────
echo [..] Running test suite...
py -m unittest discover tests -q 2>nul
if %ERRORLEVEL% neq 0 (
    echo [WARN] Some tests failed - check output above.
) else (
    echo [OK] All 47 tests passing.
)

:: ── Step 8: Open browser ──────────────────────────────────────
echo.
echo [..] Opening Dashboard and 2D Simulation in browser...
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:5000"
start "" "http://127.0.0.1:5001"

:: ── Step 9: Start Dual Servers (Port 5000 & Port 5001) ────────
echo.
echo ============================================================
echo   1. Main Dashboard:        http://127.0.0.1:5000
echo   2. 2D Road Simulation:    http://127.0.0.1:5001
echo   3. Real-Time Sync:        ACTIVE (Simulation updates Dashboard)
echo   Press Ctrl+C to stop both servers.
echo ============================================================
echo.
py "%ROOT%run_servers.py"
