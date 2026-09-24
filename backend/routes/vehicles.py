from flask import Blueprint, jsonify, request
from backend.database import query_all, query_one, execute_commit

vehicles_bp = Blueprint('vehicles', __name__)

@vehicles_bp.route('', methods=['GET'])
def get_vehicles():
    sim_id = request.args.get('simulation_id')
    junction_id = request.args.get('junction_id')
    status = request.args.get('status')

    sql = "SELECT * FROM vehicles WHERE 1=1"
    params = []

    if sim_id:
        sql += " AND simulation_id = %s"
        params.append(sim_id)
    if junction_id:
        sql += " AND junction_id = %s"
        params.append(junction_id)
    if status:
        sql += " AND status = %s"
        params.append(status)

    sql += " ORDER BY arrival_time ASC, id ASC"
    vehicles = query_all(sql, params)
    return jsonify({"status": "SUCCESS", "count": len(vehicles), "data": vehicles})

@vehicles_bp.route('/<int:v_id>', methods=['GET'])
def get_vehicle(v_id):
    vehicle = query_one("SELECT * FROM vehicles WHERE id = %s", (v_id,))
    if not vehicle:
        return jsonify({"status": "ERROR", "message": f"Vehicle {v_id} not found"}), 404
    return jsonify({"status": "SUCCESS", "data": vehicle})

@vehicles_bp.route('', methods=['POST'])
def create_vehicle():
    data = request.get_json() or {}
    sim_id = data.get('simulation_id', 1)
    plate = data.get('plate_number', '').strip()
    v_type = data.get('vehicle_type', 'Car')
    junction_id = data.get('junction_id')
    direction = data.get('direction', 'NORTH').upper()
    arrival_time = data.get('arrival_time', 0)
    burst_time = data.get('burst_time', 2)
    priority = data.get('priority', 3)
    is_emergency = 1 if data.get('is_emergency') else 0
    source = data.get('source', 'Origin')
    destination = data.get('destination', 'Destination')

    # Validations
    if not plate:
        import random
        plate = f"UK07-{v_type[:2].upper()}-{random.randint(1000, 9999)}"

    if not junction_id:
        return jsonify({"status": "ERROR", "message": "junction_id is required"}), 400

    if direction not in ['NORTH', 'SOUTH', 'EAST', 'WEST']:
        return jsonify({"status": "ERROR", "message": "Direction must be NORTH, SOUTH, EAST, or WEST"}), 400

    try:
        arrival_time = int(arrival_time)
        burst_time = int(burst_time)
        priority = int(priority)
    except ValueError:
        return jsonify({"status": "ERROR", "message": "arrival_time, burst_time, priority must be integers"}), 400

    if arrival_time < 0:
        return jsonify({"status": "ERROR", "message": "arrival_time cannot be negative"}), 400
    if burst_time <= 0:
        return jsonify({"status": "ERROR", "message": "burst_time must be greater than 0"}), 400
    if priority <= 0:
        priority = 1

    if is_emergency:
        priority = 1

    new_id = execute_commit(
        """INSERT INTO vehicles
           (simulation_id, plate_number, vehicle_type, junction_id, source, destination,
            direction, arrival_time, burst_time, remaining_time, initial_priority, priority,
            is_emergency, status)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'WAITING')""",
        (sim_id, plate, v_type, junction_id, source, destination, direction,
         arrival_time, burst_time, burst_time, priority, priority, is_emergency)
    )

    execute_commit(
        "UPDATE simulations SET total_vehicles = (SELECT COUNT(*) FROM vehicles WHERE simulation_id = %s) WHERE id = %s",
        (sim_id, sim_id)
    )

    created = query_one("SELECT * FROM vehicles WHERE id = %s", (new_id,))
    return jsonify({"status": "SUCCESS", "data": created}), 201

@vehicles_bp.route('/<int:v_id>', methods=['PUT'])
def update_vehicle(v_id):
    vehicle = query_one("SELECT * FROM vehicles WHERE id = %s", (v_id,))
    if not vehicle:
        return jsonify({"status": "ERROR", "message": f"Vehicle {v_id} not found"}), 404

    data = request.get_json() or {}
    status = data.get('status', vehicle['status'])
    priority = data.get('priority', vehicle['priority'])
    burst_time = data.get('burst_time', vehicle['burst_time'])

    execute_commit(
        """UPDATE vehicles SET
           status = %s, priority = %s, burst_time = %s
           WHERE id = %s""",
        (status, priority, burst_time, v_id)
    )

    updated = query_one("SELECT * FROM vehicles WHERE id = %s", (v_id,))
    return jsonify({"status": "SUCCESS", "data": updated})

@vehicles_bp.route('/<int:v_id>', methods=['DELETE'])
def delete_vehicle(v_id):
    vehicle = query_one("SELECT * FROM vehicles WHERE id = %s", (v_id,))
    if not vehicle:
        return jsonify({"status": "ERROR", "message": f"Vehicle {v_id} not found"}), 404

    sim_id = vehicle['simulation_id']
    execute_commit("DELETE FROM vehicles WHERE id = %s", (v_id,))
    execute_commit(
        "UPDATE simulations SET total_vehicles = (SELECT COUNT(*) FROM vehicles WHERE simulation_id = %s) WHERE id = %s",
        (sim_id, sim_id)
    )

    return jsonify({"status": "SUCCESS", "message": f"Vehicle {v_id} deleted successfully"})
