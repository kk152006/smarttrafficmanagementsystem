"""
SmartTraffic - Dual Server Launcher
Starts both:
  1. Main Dashboard & REST API on Port 5000 (http://localhost:5000)
  2. 2D Interactive Road Network Simulation on Port 5001 (http://localhost:5001)

Real-time synchronization connects the 2D simulation directly with the dashboard!
"""

import sys
import time
import threading
from backend.app import create_app as create_dashboard_app
from simulation_server import create_simulation_app

def start_dashboard():
    app = create_dashboard_app()
    app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)

def start_simulation():
    app = create_simulation_app()
    app.run(host='0.0.0.0', port=5001, debug=False, use_reloader=False)

def main():
    print("=" * 66)
    print("🚦  SMARTTRAFFIC OS + DBMS PBL - DUAL SERVER SYSTEM")
    print("=" * 66)
    print("  1. Main Dashboard:        http://localhost:5000")
    print("  2. 2D Road Simulation:    http://localhost:5001")
    print("  3. Real-Time Sync:        ACTIVE (Simulation updates Dashboard)")
    print("=" * 66)
    print("Press Ctrl+C to stop both servers.\n")

    t1 = threading.Thread(target=start_dashboard, daemon=True)
    t2 = threading.Thread(target=start_simulation, daemon=True)

    t1.start()
    t2.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[+] Shutting down SmartTraffic servers cleanly...")
        sys.exit(0)

if __name__ == '__main__':
    main()
