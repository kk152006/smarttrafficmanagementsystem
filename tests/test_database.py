import unittest
import pymysql
from backend.database import get_connection, query_all, query_one, execute_commit, execute_transaction

class TestDatabase(unittest.TestCase):
    def test_database_connection(self):
        conn = get_connection()
        self.assertIsNotNone(conn)
        conn.close()

    def test_foreign_key_cascade(self):
        # Create dummy simulation
        sim_id = execute_commit(
            "INSERT INTO simulations (name, algorithm, status) VALUES ('FK Test Sim', 'FCFS', 'CREATED')"
        )
        # Create vehicle under this simulation
        v_id = execute_commit(
            """INSERT INTO vehicles
               (simulation_id, plate_number, vehicle_type, junction_id, direction, burst_time)
               VALUES (%s, 'UK07-FK-0001', 'Car', 1, 'NORTH', 2)""",
            (sim_id,)
        )
        # Verify vehicle exists
        v = query_one("SELECT * FROM vehicles WHERE id = %s", (v_id,))
        self.assertIsNotNone(v)

        # Delete simulation -> vehicle must be CASCADE deleted
        execute_commit("DELETE FROM simulations WHERE id = %s", (sim_id,))
        v_after = query_one("SELECT * FROM vehicles WHERE id = %s", (v_id,))
        self.assertIsNone(v_after, "Vehicle should be cascade-deleted when simulation is deleted")

    def test_transaction_rollback_on_failure(self):
        # Count vehicles before
        cnt_before = query_one("SELECT COUNT(*) as c FROM vehicles")['c']

        # Attempt transaction with 1 valid insert and 1 invalid insert (violating non-null / foreign key)
        ops = [
            ("""INSERT INTO vehicles
                (simulation_id, plate_number, vehicle_type, junction_id, direction, burst_time)
                VALUES (1, 'UK07-ROLLBACK-1', 'Car', 1, 'NORTH', 2)""", ()),
            ("""INSERT INTO vehicles
                (simulation_id, plate_number, vehicle_type, junction_id, direction, burst_time)
                VALUES (999999, 'UK07-FAIL', 'Car', 999999, 'NORTH', 2)""", ()) # Invalid foreign key
        ]

        with self.assertRaises(Exception):
            execute_transaction(ops)

        # Count vehicles after: must remain unchanged due to rollback!
        cnt_after = query_one("SELECT COUNT(*) as c FROM vehicles")['c']
        self.assertEqual(cnt_before, cnt_after, "Transaction must rollback all changes on error")

    def test_table_counts_and_constraints(self):
        juncs = query_all("SELECT * FROM junctions")
        self.assertGreaterEqual(len(juncs), 4)

        roads = query_all("SELECT * FROM roads")
        self.assertGreaterEqual(len(roads), 8)

        # Verify signals unique constraint (junction_id, direction)
        signals = query_all("SELECT junction_id, direction, COUNT(*) as cnt FROM traffic_signals GROUP BY junction_id, direction HAVING cnt > 1")
        self.assertEqual(len(signals), 0, "No duplicate direction signals per junction")

if __name__ == '__main__':
    unittest.main()
