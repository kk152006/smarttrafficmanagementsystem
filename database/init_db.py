import os
import pymysql
import sys

def init_database(host='127.0.0.1', port=3306, user='root', password='Kshitij@15', db_name='smarttraffic'):
    print(f"Connecting to MySQL at {host}:{port} as {user}...")
    try:
        conn = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            autocommit=True,
            charset='utf8mb4'
        )
    except Exception as e:
        print(f"Failed to connect to MySQL: {e}")
        return False

    cursor = conn.cursor()

    base_dir = os.path.dirname(os.path.abspath(__file__))
    schema_path = os.path.join(base_dir, 'schema.sql')
    seed_path = os.path.join(base_dir, 'seed.sql')

    print(f"Applying schema from {schema_path}...")
    with open(schema_path, 'r', encoding='utf-8') as f:
        schema_sql = f.read()

    # Split commands by semicolon while respecting definitions
    for statement in schema_sql.split(';'):
        stmt = statement.strip()
        if stmt:
            try:
                cursor.execute(stmt)
            except Exception as e:
                print(f"Schema execution error on statement: {stmt[:60]}... -> {e}")

    print(f"Applying seed data from {seed_path}...")
    with open(seed_path, 'r', encoding='utf-8') as f:
        seed_sql = f.read()

    for statement in seed_sql.split(';'):
        stmt = statement.strip()
        if stmt:
            try:
                cursor.execute(stmt)
            except Exception as e:
                print(f"Seed execution error on statement: {stmt[:60]}... -> {e}")

    # Verify tables
    cursor.execute(f"USE {db_name}")
    cursor.execute("SHOW TABLES")
    tables = [r[0] for r in cursor.fetchall()]
    print(f"SUCCESS: Database '{db_name}' initialized with tables: {tables}")

    cursor.execute("SELECT COUNT(*) FROM junctions")
    j_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM roads")
    r_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM traffic_signals")
    s_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM vehicles")
    v_count = cursor.fetchone()[0]

    print(f"Verified Records -> Junctions: {j_count}, Roads: {r_count}, Signals: {s_count}, Vehicles: {v_count}")
    conn.close()
    return True

if __name__ == '__main__':
    pwd = os.getenv('DB_PASSWORD', 'Kshitij@15')
    user = os.getenv('DB_USER', 'root')
    host = os.getenv('DB_HOST', '127.0.0.1')
    port = int(os.getenv('DB_PORT', 3306))
    success = init_database(host=host, port=port, user=user, password=pwd)
    sys.exit(0 if success else 1)
