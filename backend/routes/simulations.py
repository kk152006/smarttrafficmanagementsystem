from flask import Blueprint, jsonify, request
from backend.services.simulation_service import SimulationService
from backend.database import query_all, query_one, execute_commit

simulations_bp = Blueprint('simulations', __name__)

@simulations_bp.route('', methods=['GET'])
def get_simulations():
    sims = SimulationService.list_simulations()
    return jsonify({"status": "SUCCESS", "data": sims})

@simulations_bp.route('', methods=['POST'])
def create_simulation():
    data = request.get_json() or {}
    try:
        sim = SimulationService.create_simulation(data)
        return jsonify({"status": "SUCCESS", "data": sim}), 201
    except Exception as e:
        return jsonify({"status": "ERROR", "message": str(e)}), 400

@simulations_bp.route('/<int:sim_id>', methods=['GET'])
def get_simulation(sim_id):
    sim = SimulationService.get_simulation(sim_id)
    if not sim:
        return jsonify({"status": "ERROR", "message": f"Simulation {sim_id} not found"}), 404
    return jsonify({"status": "SUCCESS", "data": sim})

@simulations_bp.route('/<int:sim_id>/run', methods=['POST'])
@simulations_bp.route('/<int:sim_id>/start', methods=['POST'])
def start_simulation(sim_id):
    data = request.get_json() or {}
    algorithm = data.get('algorithm')
    quantum = data.get('quantum')
    scenario = data.get('scenario')

    # Optionally update algorithm/quantum/scenario before running
    if algorithm:
        execute_commit("UPDATE simulations SET algorithm = %s WHERE id = %s", (algorithm, sim_id))
    if quantum is not None:
        execute_commit("UPDATE simulations SET quantum = %s WHERE id = %s", (quantum, sim_id))
    if scenario:
        curr = query_one("SELECT scenario FROM simulations WHERE id = %s", (sim_id,))
        v_cnt = query_one("SELECT COUNT(*) as c FROM vehicles WHERE simulation_id = %s", (sim_id,))
        force_reseed = data.get('force_reseed', False)
        execute_commit("UPDATE simulations SET scenario = %s WHERE id = %s", (scenario, sim_id))
        if force_reseed or not curr or curr.get('scenario') != scenario or not v_cnt or v_cnt.get('c', 0) == 0:
            SimulationService.seed_scenario_vehicles(sim_id, scenario)

    try:
        result = SimulationService.run_simulation(sim_id)
        return jsonify({"status": "SUCCESS", "data": result})
    except Exception as e:
        return jsonify({"status": "ERROR", "message": str(e)}), 500

@simulations_bp.route('/<int:sim_id>/pause', methods=['POST'])
def pause_simulation(sim_id):
    try:
        sim = SimulationService.pause_simulation(sim_id)
        return jsonify({"status": "SUCCESS", "data": sim})
    except Exception as e:
        return jsonify({"status": "ERROR", "message": str(e)}), 400

@simulations_bp.route('/<int:sim_id>/resume', methods=['POST'])
def resume_simulation(sim_id):
    try:
        sim = SimulationService.resume_simulation(sim_id)
        return jsonify({"status": "SUCCESS", "data": sim})
    except Exception as e:
        return jsonify({"status": "ERROR", "message": str(e)}), 400

@simulations_bp.route('/<int:sim_id>/reset', methods=['POST'])
def reset_simulation(sim_id):
    try:
        sim = SimulationService.reset_simulation(sim_id)
        return jsonify({"status": "SUCCESS", "data": sim})
    except Exception as e:
        return jsonify({"status": "ERROR", "message": str(e)}), 400

@simulations_bp.route('/<int:sim_id>/state', methods=['GET'])
def get_simulation_state(sim_id):
    sim = SimulationService.get_simulation(sim_id)
    if not sim:
        return jsonify({"status": "ERROR", "message": f"Simulation {sim_id} not found"}), 404

    # Summary counts
    counts = query_one(
        """SELECT
             COUNT(*) AS total_vehicles,
             SUM(CASE WHEN status = 'RUNNING' THEN 1 ELSE 0 END) AS active_vehicles,
             SUM(CASE WHEN status = 'WAITING' THEN 1 ELSE 0 END) AS waiting_vehicles,
             SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_vehicles,
             SUM(CASE WHEN is_emergency = 1 AND status != 'COMPLETED' THEN 1 ELSE 0 END) AS emergency_vehicles
           FROM vehicles WHERE simulation_id = %s""",
        (sim_id,)
    )

    # Active incidents
    incidents = query_all("SELECT * FROM traffic_incidents WHERE simulation_id = %s AND is_active = 1", (sim_id,))

    # Junctions with signals and real-time waiting queues
    junctions = query_all("SELECT * FROM junctions ORDER BY id ASC")
    signals = query_all("SELECT * FROM traffic_signals ORDER BY junction_id, direction")
    queue_data = query_all(
        """SELECT junction_id, direction, COUNT(*) as cnt
           FROM vehicles WHERE simulation_id = %s AND status = 'WAITING'
           GROUP BY junction_id, direction""",
        (sim_id,)
    )

    # Map signals and queues to junctions
    j_map = {}
    for j in junctions:
        j_map[j['id']] = j
        j['signals'] = {}
        j['queues'] = {'NORTH': 0, 'SOUTH': 0, 'EAST': 0, 'WEST': 0}

    for s in signals:
        if s['junction_id'] in j_map:
            j_map[s['junction_id']]['signals'][s['direction']] = {
                'state': s['state'],
                'green_time': s['green_time']
            }

    for q in queue_data:
        if q['junction_id'] in j_map:
            j_map[q['junction_id']]['queues'][q['direction']] = q['cnt']

    # Recent events
    recent_events = query_all(
        """SELECT * FROM vehicle_events
           WHERE simulation_id = %s ORDER BY id DESC LIMIT 15""",
        (sim_id,)
    )

    state = {
        "simulation": sim,
        "summary": {
            "total_vehicles": counts['total_vehicles'] or 0,
            "active_vehicles": counts['active_vehicles'] or 0,
            "waiting_vehicles": counts['waiting_vehicles'] or 0,
            "completed_vehicles": counts['completed_vehicles'] or 0,
            "emergency_vehicles": counts['emergency_vehicles'] or 0,
            "junction_count": len(junctions),
            "active_incidents": len(incidents),
            "avg_waiting_time": float(sim['avg_waiting_time']),
            "avg_turnaround_time": float(sim['avg_turnaround_time']),
            "throughput": float(sim['throughput']),
            "current_tick": sim['current_tick']
        },
        "junctions": junctions,
        "incidents": incidents,
        "recent_events": recent_events
    }

    return jsonify({"status": "SUCCESS", "data": state})

@simulations_bp.route('/<int:sim_id>/live-sync', methods=['POST'])
def live_sync_simulation(sim_id):
    data = request.get_json() or {}
    signals = data.get('signals')
    metrics = data.get('metrics')
    vehicles = data.get('vehicles')
    event = data.get('event')

    # 1. Update signals in DB
    if signals and isinstance(signals, dict):
        for j_id_str, sig_info in signals.items():
            try:
                j_id = int(j_id_str)
                active_dir = sig_info.get('activeDir', 'NORTH')
                dirs = sig_info.get('dirs', {})
                execute_commit("UPDATE junctions SET active_direction = %s, current_phase = %s WHERE id = %s",
                               (active_dir, f"SIGNAL_{active_dir}_GREEN", j_id))
                for d, s in dirs.items():
                    execute_commit("UPDATE traffic_signals SET state = %s WHERE junction_id = %s AND direction = %s",
                                   (s, j_id, d))
            except Exception:
                pass

    # 2. Update metrics in simulations table
    if metrics and isinstance(metrics, dict):
        avg_wait = float(metrics.get('avg_waiting_time', 0.0))
        avg_tat = float(metrics.get('avg_turnaround_time', avg_wait * 1.5))
        throughput = float(metrics.get('throughput', 0.0))
        tick = int(metrics.get('current_tick', 0))
        execute_commit(
            """UPDATE simulations
               SET avg_waiting_time = %s, avg_turnaround_time = %s, throughput = %s, current_tick = %s, status = 'RUNNING'
               WHERE id = %s""",
            (avg_wait, avg_tat, throughput, tick, sim_id)
        )

    # 3. Update or sync vehicle records
    if vehicles and isinstance(vehicles, list):
        for v in vehicles:
            plate = v.get('plate_number')
            if not plate:
                continue
            status = v.get('status', 'WAITING')
            v_type = v.get('vehicle_type', 'Car')
            j_id = int(v.get('junction_id', 1))
            direction = v.get('direction', 'NORTH')
            wait_time = float(v.get('waiting_time', 0.0))
            is_emerg = 1 if v.get('is_emergency') else 0
            prio = 1 if is_emerg else int(v.get('priority', 3))

            existing = query_one("SELECT id FROM vehicles WHERE simulation_id = %s AND plate_number = %s", (sim_id, plate))
            if existing:
                execute_commit(
                    """UPDATE vehicles
                       SET status = %s, waiting_time = %s, junction_id = %s, direction = %s
                       WHERE id = %s""",
                    (status, wait_time, j_id, direction, existing['id'])
                )
            else:
                execute_commit(
                    """INSERT INTO vehicles
                       (simulation_id, plate_number, vehicle_type, junction_id, source, destination,
                        direction, arrival_time, burst_time, remaining_time, initial_priority, priority,
                        is_emergency, status, waiting_time)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, 0, 2, 2, %s, %s, %s, %s, %s)""",
                    (sim_id, plate, v_type, j_id, 'Road Network', f'Junction {j_id}',
                     direction, prio, prio, is_emerg, status, wait_time)
                )

    # 4. Optional event insert
    if event and isinstance(event, dict):
        try:
            execute_commit(
                """INSERT INTO vehicle_events
                   (vehicle_id, simulation_id, junction_id, event_type, details)
                   VALUES (%s, %s, %s, %s, %s)""",
                (event.get('vehicle_id', 1), sim_id, event.get('junction_id', 1),
                 event.get('event_type', 'CROSSING'), event.get('description', 'Vehicle crossed intersection'))
            )
        except Exception:
            pass

    # Update total count
    execute_commit(
        "UPDATE simulations SET total_vehicles = (SELECT COUNT(*) FROM vehicles WHERE simulation_id = %s) WHERE id = %s",
        (sim_id, sim_id)
    )

    sim = SimulationService.get_simulation(sim_id)
    return jsonify({
        "status": "SUCCESS",
        "data": {
            "algorithm": sim['algorithm'] if sim else 'ADAPTIVE',
            "quantum": sim['quantum'] if sim else 3,
            "scenario": sim['scenario'] if sim else 'NORMAL'
        }
    })
