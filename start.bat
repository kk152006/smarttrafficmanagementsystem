@echo off
echo ============================================================
echo  SmartTraffic System Startup
echo  Team OSDBMS-V-2026-T217  |  Graphic Era University
echo ============================================================
echo.

set "ROOT=%~dp0"

:: ── Step 1: Check Python ──────────────────────────────────────
py --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python not found. Install Python 3.10+ and add to PATH.
    pause & exit /b 1
)
echo [OK] Python found.

:: ── Step 2: Check GCC ────────────────────────────────────────
gcc --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARN] GCC not found. C engine must be pre-compiled.
) else (
    echo [OK] GCC found.
)

:: ── Step 3: Check if .env exists ─────────────────────────────
if not exist "%ROOT%.env" (
    echo [ERROR] .env file missing. Copy .env.example to .env and fill in DB credentials.
    pause & exit /b 1
)
echo [OK] .env found.

:: ── Step 4: Install Python dependencies ──────────────────────
echo.
echo Installing Python dependencies...
py -m pip install -r "%ROOT%requirements.txt" -q
if %ERRORLEVEL% neq 0 (
    echo [ERROR] pip install failed.
    pause & exit /b 1
)
echo [OK] Dependencies installed.

:: ── Step 5: Check C engine binary ────────────────────────────
if not exist "%ROOT%c_engine\bin\traffic_engine.exe" (
    echo.
    echo [WARN] C engine binary not found. Attempting to compile...
    call "%ROOT%compile_engine.bat"
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Could not compile C engine. System cannot run simulations.
        pause & exit /b 1
    )
)
echo [OK] C engine binary found.

:: ── Step 6: Initialize database ──────────────────────────────
echo.
echo Initializing database (schema + seed data)...
py "%ROOT%database\init_db.py"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Database initialization failed. Check MySQL is running and .env credentials are correct.
    pause & exit /b 1
)
echo [OK] Database initialized.

:: ── Step 7: Run test suite ───────────────────────────────────
echo.
echo Running test suite...
py -m unittest discover tests -q
if %ERRORLEVEL% neq 0 (
    echo [WARN] Some tests failed. Check the output above before proceeding.
    echo        Press any key to start server anyway, or Ctrl+C to abort.
    pause
) else (
    echo [OK] All tests passed.
)

:: ── Step 8: Open browser ─────────────────────────────────────
echo.
echo Opening browser in 3 seconds...
timeout /t 3 /nobreak >nul
start "" "http://localhost:5000"

:: ── Step 9: Start Flask server ───────────────────────────────
echo.
echo ============================================================
echo  SmartTraffic Dashboard: http://localhost:5000
echo  Press Ctrl+C to stop the server.
echo ============================================================
echo.
cd /d "%ROOT%"
py -m backend.app
