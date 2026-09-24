# SmartTraffic — OS + DBMS PBL System

**Team:** OSDBMS-V-2026-T217  
**Members:** Kshitij Kukreti · Abhay Pratap Singh Negi · Abhyudaya Bhandari  
**Mentor:** Dr. Hradesh Kumar  
**Institution:** Graphic Era (Deemed to be University), Dehradun  
**Session:** 2025–26, Semester V

---

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Features](#features)
5. [Prerequisites](#prerequisites)
6. [Quick Start](#quick-start)
7. [Manual Setup](#manual-setup)
8. [API Reference](#api-reference)
9. [Database Schema](#database-schema)
10. [C Engine](#c-engine)
11. [OS Synchronization](#os-synchronization)
12. [Testing](#testing)
13. [Project Structure](#project-structure)
14. [Academic Compliance](#academic-compliance)

---

## Overview

SmartTraffic is a full-stack intelligent traffic management system built as a Problem-Based Learning (PBL) project integrating:

- **Operating Systems** — CPU scheduling algorithms (FCFS, Priority with Aging, Round Robin, Adaptive) implemented in C, applied to vehicle/junction scheduling; plus real OS synchronization primitives (Mutex, Semaphore, Critical Section) via Win32 threads
- **Database Management Systems** — Normalized MySQL schema with 11 tables, ACID transactions, foreign key constraints, and real-time analytics queries
- **Web Engineering** — Flask REST API backend + Leaflet.js live map + Chart.js analytics dashboard

The system is **end-to-end working**: a browser-based dashboard controls a live Flask server which drives a compiled C scheduling engine that stores results in MySQL.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Web Browser Dashboard                         │
│  Leaflet Map │ Signal Controls │ Simulation Panel │ Analytics    │
└───────────────────────────┬─────────────────────────────────────┘
                            │  HTTP REST (JSON)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Flask Backend (Python)                         │
│   /api/junctions  /api/simulations  /api/signals  /api/analytics │
│   /api/vehicles   /api/roads        /api/incidents /api/system   │
├─────────────────────────────────────────────────────────────────┤
│  CEngineService                SimulationService                 │
│  (subprocess wrapper)          (ACID transactions)               │
└──────────┬──────────────────────────────────┬───────────────────┘
           │  JSON file I/O                   │  SQL
           ▼                                  ▼
┌─────────────────────┐           ┌─────────────────────────────┐
│   C Engine (Win32)  │           │   MySQL 8.0 — smarttraffic  │
│   traffic_engine.exe│           │   11 normalized tables      │
│                     │           │   ACID • FK constraints      │
│  FCFS / Priority /  │           │   Views • Indexes           │
│  Round Robin /      │           └─────────────────────────────┘
│  Adaptive           │
│  Mutex + Semaphore  │
│  OS Threads (8)     │
└─────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Scheduling Engine | C (ANSI C99) + Win32 API | GCC 6.3+ / MinGW |
| Backend | Python / Flask | 3.13 / 3.x |
| Database | MySQL | 8.0 |
| ORM / Driver | PyMySQL | latest |
| Frontend | HTML5 + CSS3 + JavaScript | ES6+ |
| Map | Leaflet.js | 1.9 (CDN) |
| Charts | Chart.js | 4.x (CDN) |
| Fonts/Icons | Google Fonts + Emoji | CDN |

---

## Features

### Scheduling Algorithms (C Engine)
| Algorithm | Description |
|-----------|-------------|
| **FCFS** | First Come First Served — vehicles scheduled in arrival order |
| **Priority with Aging** | Priority queue; starvation prevented by decrementing priority every N time units |
| **Round Robin** | Fixed quantum time slice per vehicle/direction, fair rotation |
| **Adaptive** | Dynamic green time based on queue length, wait time, and direction scoring; emergency vehicles get +150 bonus |

### Real-Time Dashboard
- 📊 Live KPIs: throughput, average wait time, active vehicles, queue length
- 🗺️ Leaflet map of 4 real Dehradun junctions (ISBT, Rajpur Road, Clock Tower, Ballupur)
- 🚦 Junction signal monitors with animated RED/YELLOW/GREEN lights
- 🚗 Vehicle management table (add, view, filter by type/priority)
- 🆘 Incident reporting with automatic road closure
- 📈 Algorithm comparison analytics (Chart.js dual-axis: throughput + wait time)

### OS Synchronization (Live Demo)
- **Mutex:** Exclusive access to shared signal state
- **Counting Semaphore:** Concurrent lane access control (max 3 simultaneous)
- **Critical Section:** Per-junction data structure protection
- 8 concurrent Win32 threads with no deadlocks or race conditions
- Full JSON output with lock acquisition logs

### Database Features
- 11 normalized tables (3NF+)
- ACID transactions for simulation runs
- Cascading deletes enforced by FK constraints
- Unique constraint on `(junction_id, direction)` for signal integrity
- Real-time analytics aggregation queries

---

## Prerequisites

| Requirement | Minimum Version | Notes |
|-------------|----------------|-------|
| Python | 3.10+ | `py` command must work |
| GCC (MinGW) | 6.3+ | For compiling C engine |
| MySQL | 8.0 | Must be running as service |
| Git | 2.x | Optional, for version control |

**MySQL must be running** before starting the server.  
Default connection: `root@127.0.0.1:3306`

---

## Quick Start

### One-Click (Windows)

```bat
start.bat
```

This script automatically:
1. Checks Python and GCC
2. Installs Python dependencies
3. Compiles C engine (if binary missing)
4. Initializes MySQL database (schema + seed data)
5. Runs all 42 tests
6. Opens browser to `http://localhost:5000`
7. Starts Flask server

### Manual Start (if you prefer)

```powershell
# 1. Install dependencies
py -m pip install -r requirements.txt

# 2. Create .env (copy from example and fill credentials)
copy .env.example .env
# Edit .env: set DB_PASSWORD=<your mysql root password>

# 3. Compile C engine
compile_engine.bat

# 4. Initialize database
py database\init_db.py

# 5. Run tests
py -m unittest discover tests

# 6. Start server
py -m backend.app
```

Visit `http://localhost:5000`.

---

## Manual Setup

### 1. Environment File (`.env`)

```ini
# Flask
FLASK_ENV=development
FLASK_DEBUG=true
SECRET_KEY=smarttraffic-secret-2026

# Database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=smarttraffic
DB_USER=root
DB_PASSWORD=your_mysql_password_here

# C Engine
C_ENGINE_PATH=c_engine/bin/traffic_engine.exe
C_ENGINE_TIMEOUT=10
```

### 2. Compile C Engine

```bat
compile_engine.bat
```

Or manually:
```powershell
gcc -Wall -O2 -o c_engine\bin\traffic_engine.exe `
    c_engine\main.c c_engine\scheduler.c c_engine\sync_sim.c
```

### 3. Initialize Database

```powershell
py database\init_db.py
```

Creates the `smarttraffic` database, applies schema, and seeds:
- 4 Dehradun junctions (ISBT, Rajpur Road, Clock Tower, Ballupur)
- 8 roads
- 16 traffic signals (4 per junction: N/S/E/W)
- 4 sample users
- 12 demo vehicles
- 1 sample incident

---

## API Reference

All endpoints return JSON. Base URL: `http://localhost:5000`

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/system/health` | Database + C engine status |
| GET | `/api/system/sync-test` | OS mutex/semaphore demo result |
| POST | `/api/system/sync-test` | Re-run sync demo (fresh) |

### Junctions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/junctions` | List all junctions with signals |
| GET | `/api/junctions/<id>` | Single junction details |
| PUT | `/api/junctions/<id>` | Update junction status |

### Roads
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/roads` | List all roads |
| POST | `/api/roads/<id>/toggle-closure` | Open/close a road |

### Vehicles
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/vehicles` | List all vehicles (optional: `?simulation_id=N`) |
| POST | `/api/vehicles` | Add new vehicle |
| GET | `/api/vehicles/<id>` | Single vehicle |
| PUT | `/api/vehicles/<id>` | Update vehicle |
| DELETE | `/api/vehicles/<id>` | Delete vehicle |

### Simulations
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/simulations` | Create new simulation |
| GET | `/api/simulations` | List all simulations |
| GET | `/api/simulations/<id>` | Simulation details |
| POST | `/api/simulations/<id>/run` | Run simulation (calls C engine) |
| POST | `/api/simulations/<id>/pause` | Pause running simulation |
| POST | `/api/simulations/<id>/resume` | Resume paused simulation |
| POST | `/api/simulations/<id>/reset` | Reset to CREATED state |
| GET | `/api/simulations/<id>/state` | Live state (KPIs, signals, vehicles) |

### Signals
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/signals/manual` | Set one direction GREEN (mutual exclusion enforced) |
| POST | `/api/signals/automatic` | Return junction to automatic mode |

### Incidents
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/incidents` | List all incidents |
| POST | `/api/incidents` | Report new incident |
| GET | `/api/incidents/<id>` | Single incident |
| PUT | `/api/incidents/<id>` | Update incident |
| POST | `/api/incidents/<id>/resolve` | Resolve incident (reopens roads) |
| DELETE | `/api/incidents/<id>` | Delete incident |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics` | Overall analytics across all simulations |
| GET | `/api/analytics/<sim_id>` | Analytics for specific simulation |
| POST | `/api/analytics/compare` | Benchmark all 4 algorithms (returns comparison data) |

---

## Database Schema

```
smarttraffic database — 11 tables (3NF)

users               — system users (id, username, role, hash)
junctions           — traffic intersections (id, name, lat, lng, status)
roads               — road segments (id, from_junc, to_junc, lanes, length, closed)
vehicles            — vehicle registry (id, type, priority, junction_id, arrival_time, weight)
vehicle_events      — scheduling timeline (vehicle_id, event_type, time, details)
traffic_signals     — per-direction signals (junction_id, direction, state, duration)
signal_events       — signal change log (signal_id, old_state, new_state, changed_by)
simulations         — simulation runs (id, algorithm, status, config, timestamps)
traffic_incidents   — reported incidents (junction/road, severity, type, status)
scheduling_results  — C engine output stored per simulation
performance_metrics — aggregated KPIs per simulation run
```

**Key constraints:**
- `UNIQUE(junction_id, direction)` on `traffic_signals` — exactly one signal per direction per junction
- FK `ON DELETE CASCADE` on `vehicle_events` → `vehicles`
- FK `ON DELETE RESTRICT` on `junctions` (no orphan roads)

---

## C Engine

### Compilation

```bat
compile_engine.bat
```

### Usage Modes

```powershell
# File mode (used by Flask backend)
traffic_engine.exe --file input.json --out output.json

# Stdin mode
echo {...} | traffic_engine.exe --stdin

# OS sync test
traffic_engine.exe --test-sync

# Interactive mode
traffic_engine.exe
```

### Input JSON Schema

```json
{
  "algorithm": "PRIORITY",
  "time_quantum": 3,
  "vehicles": [
    {
      "id": "V001",
      "type": "EMERGENCY",
      "priority": 1,
      "junction_id": "J1",
      "arrival_time": 0,
      "weight": 1.5
    }
  ],
  "junctions": [
    { "id": "J1", "name": "ISBT" }
  ]
}
```

**Supported algorithms:** `FCFS`, `PRIORITY`, `ROUND_ROBIN`, `ADAPTIVE`

### Output JSON Schema

```json
{
  "algorithm": "PRIORITY",
  "total_vehicles": 5,
  "scheduled_count": 5,
  "metrics": {
    "avg_wait_time": 2.4,
    "throughput": 12.5,
    "total_time": 24,
    "emergency_avg_wait": 0.0
  },
  "events": [
    { "vehicle_id": "V001", "event_type": "STARTED", "time": 0 }
  ],
  "junctions": [
    {
      "id": "J1",
      "signals": [
        { "direction": "NORTH", "state": "GREEN", "duration": 30 }
      ]
    }
  ]
}
```

---

## OS Synchronization

The C engine demonstrates real OS synchronization using Win32 APIs:

| Primitive | API Used | Purpose |
|-----------|----------|---------|
| Mutex | `CreateMutex()` / `WaitForSingleObject()` | Exclusive access to shared signal state |
| Counting Semaphore | `CreateSemaphore()` | Limit concurrent lane access (max 3) |
| Critical Section | `InitializeCriticalSection()` | Per-junction data protection |
| Threads | `CreateThread()` | 8 concurrent vehicle processing threads |

**Run from dashboard:** Analytics tab → "Run OS Mutex & Semaphore Verification"  
**Run from CLI:** `traffic_engine.exe --test-sync`

---

## Testing

```powershell
# All 42 tests
py -m unittest discover tests

# Individual suites
py -m unittest tests.test_c_engine       # 6 tests — C engine algorithms
py -m unittest tests.test_backend_api    # 8 tests — Flask API endpoints
py -m unittest tests.test_database       # 4 tests — MySQL ACID + constraints
py -m unittest tests.test_edge_cases     # 24 tests — boundary/error conditions
```

### Test Coverage

| Suite | Count | What's Tested |
|-------|-------|--------------|
| `test_c_engine` | 6 | Binary exists, sync demo, FCFS order, Priority aging, Round Robin quantum, Adaptive emergency |
| `test_backend_api` | 8 | Health check, junctions, roads, vehicles CRUD, manual signal (mutual exclusion), simulation lifecycle, analytics benchmark |
| `test_database` | 4 | Connection, FK cascade, transaction rollback, table constraints |
| `test_edge_cases` | 24 | Zero vehicles, empty junctions, invalid algorithm, large batches, concurrent signal safety, max priority, boundary times |
| **Total** | **42** | **All passing** ✅ |

---

## Project Structure

```
dbmsospbl/
├── c_engine/
│   ├── main.c              # Entry point (--file, --stdin, --test-sync modes)
│   ├── scheduler.h         # Structs, enums, prototypes
│   ├── scheduler.c         # All 4 scheduling algorithms + JSON I/O
│   ├── sync_sim.h          # Sync module header
│   ├── sync_sim.c          # Win32 Mutex/Semaphore implementation
│   └── bin/
│       └── traffic_engine.exe
├── database/
│   ├── schema.sql          # 11-table normalized schema
│   ├── seed.sql            # Dehradun demo data
│   └── init_db.py          # DB initializer
├── backend/
│   ├── app.py              # Flask application factory
│   ├── config.py           # Config loader (.env)
│   ├── database.py         # DB helpers + ACID transactions
│   ├── routes/
│   │   ├── junctions.py
│   │   ├── roads.py
│   │   ├── vehicles.py
│   │   ├── simulations.py
│   │   ├── signals.py
│   │   ├── incidents.py
│   │   ├── analytics.py
│   │   └── system.py
│   └── services/
│       ├── c_engine_service.py    # Subprocess wrapper
│       └── simulation_service.py  # Business logic + transactions
├── frontend/
│   ├── index.html          # Full dashboard
│   ├── css/styles.css      # Responsive styles
│   └── js/
│       ├── app.js          # Bootstrap
│       ├── api.js          # REST client
│       ├── map.js          # Leaflet map module
│       ├── simulation.js   # Simulation + KPI controller
│       └── analytics.js    # Chart.js analytics
├── tests/
│   ├── test_c_engine.py
│   ├── test_backend_api.py
│   ├── test_database.py
│   └── test_edge_cases.py
├── legacy/
│   ├── scheduler.c         # Original legacy C file (preserved)
│   └── scheduler1.c        # Original legacy C file (preserved)
├── docs/
│   └── PROJECT_AUDIT.md    # Requirement compliance audit
├── .env                    # Live credentials (not in git)
├── .env.example            # Template
├── .gitignore
├── requirements.txt
├── compile_engine.bat      # Compile C engine
├── start.bat               # One-click startup
└── README.md               # This file
```

---

## Academic Compliance

### OS Concepts Demonstrated

| Concept | Implementation | File |
|---------|---------------|------|
| FCFS Scheduling | `runFCFS()` — arrival-time queue | `c_engine/scheduler.c` |
| Priority Scheduling | `runPriority()` — min-heap with aging | `c_engine/scheduler.c` |
| Round Robin | `runRoundRobin()` — quantum-based rotation | `c_engine/scheduler.c` |
| Adaptive Scheduling | `runAdaptive()` — dynamic scoring | `c_engine/scheduler.c` |
| Aging (anti-starvation) | Priority decrements every N units | `c_engine/scheduler.c` |
| Mutex | `CreateMutex()` — exclusive signal lock | `c_engine/sync_sim.c` |
| Counting Semaphore | `CreateSemaphore(3)` — lane concurrency | `c_engine/sync_sim.c` |
| Critical Section | `InitializeCriticalSection()` — junction data | `c_engine/sync_sim.c` |
| Threads | `CreateThread()` — 8 concurrent threads | `c_engine/sync_sim.c` |

### DBMS Concepts Demonstrated

| Concept | Implementation | File |
|---------|---------------|------|
| Normalization (3NF) | 11 tables, no transitive deps | `database/schema.sql` |
| ACID Transactions | `execute_transaction()` | `backend/database.py` |
| Foreign Keys | Cascade delete, restrict on update | `database/schema.sql` |
| Unique Constraints | Signal direction uniqueness | `database/schema.sql` |
| Rollback | Verified in `test_database.py` | `tests/test_database.py` |
| Complex Queries | Analytics aggregations | `backend/routes/analytics.py` |
| Stored Procedures | N/A (handled in Flask services) | — |

---

*SmartTraffic PBL — Team OSDBMS-V-2026-T217 — Graphic Era University — 2025-26*
