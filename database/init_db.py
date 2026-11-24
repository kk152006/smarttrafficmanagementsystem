import os
import pymysql
import sys

def parse_sql_script(content):
    """
    Parses SQL text handling DELIMITER directives for procedures, functions, and triggers.
    Returns a list of executable SQL statement strings.
    """
    statements = []
    current_delim = ';'
    current_stmt_lines = []

    for raw_line in content.splitlines():
        line = raw_line.strip()
        # Handle DELIMITER change
        if line.upper().startswith('DELIMITER'):
            parts = line.split()
            if len(parts) >= 2:
                current_delim = parts[1]
            continue

        if not line or line.startswith('--') or line.startswith('/*'):
            # Check if this comment line also ends a statement or is pure comment
            if not current_stmt_lines:
                continue

        # Check if line ends with current delimiter
        if current_delim and raw_line.rstrip().endswith(current_delim):
            # Strip trailing delimiter
            trimmed = raw_line.rstrip()[:-len(current_delim)]
            current_stmt_lines.append(trimmed)
            full_stmt = '\n'.join(current_stmt_lines).strip()
            if full_stmt:
                statements.append(full_stmt)
            current_stmt_lines = []
        else:
            current_stmt_lines.append(raw_line)

    if current_stmt_lines:
        full_stmt = '\n'.join(current_stmt_lines).strip()
        if full_stmt:
            statements.append(full_stmt)

    return statements

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
    proc_path = os.path.join(base_dir, 'procedures.sql')
    seed_path = os.path.join(base_dir, 'seed.sql')

    # Step 1: Schema (Tables & Views)
    print(f"Applying schema and analytical views from {schema_path}...")
    with open(schema_path, 'r', encoding='utf-8') as f:
        schema_stmts = parse_sql_script(f.read())

    for stmt in schema_stmts:
        if stmt:
            try:
                cursor.execute(stmt)
            except Exception as e:
                print(f"Schema execution notice: {stmt[:60]}... -> {e}")

    # Step 2: Stored Procedures, Functions, and Triggers
    if os.path.exists(proc_path):
        print(f"Applying stored procedures, functions, and triggers from {proc_path}...")
        with open(proc_path, 'r', encoding='utf-8') as f:
            proc_stmts = parse_sql_script(f.read())

        for stmt in proc_stmts:
            if stmt:
                try:
                    cursor.execute(stmt)
                except Exception as e:
                    print(f"Procedure/Trigger execution notice: {stmt[:60]}... -> {e}")

    # Step 3: Seed Data
    print(f"Applying seed data from {seed_path}...")
    with open(seed_path, 'r', encoding='utf-8') as f:
        seed_stmts = parse_sql_script(f.read())

    for stmt in seed_stmts:
        if stmt:
            try:
                cursor.execute(stmt)
            except Exception as e:
                # Ignore duplicate key error on re-seeding
                if 'Duplicate entry' not in str(e):
                    print(f"Seed notice: {stmt[:60]}... -> {e}")

    # Verify tables
    cursor.execute(f"USE {db_name}")
    cursor.execute("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")
    tables = [r[0] for r in cursor.fetchall()]

    cursor.execute("SHOW FULL TABLES WHERE Table_type = 'VIEW'")
    views = [r[0] for r in cursor.fetchall()]

    cursor.execute("SHOW PROCEDURE STATUS WHERE Db = %s", (db_name,))
    procedures = [r[1] for r in cursor.fetchall()]

    cursor.execute("SHOW FUNCTION STATUS WHERE Db = %s", (db_name,))
    functions = [r[1] for r in cursor.fetchall()]

    cursor.execute("SHOW TRIGGERS FROM " + db_name)
    triggers = [r[0] for r in cursor.fetchall()]

    print(f"\n================ DATABASE INITIALIZATION REPORT ================")
    print(f"Database: '{db_name}' [MySQL InnoDB]")
    print(f"Tables ({len(tables)}): {', '.join(tables)}")
    print(f"Views ({len(views)}): {', '.join(views)}")
    print(f"Stored Procedures ({len(procedures)}): {', '.join(procedures)}")
    print(f"Stored Functions ({len(functions)}): {', '.join(functions)}")
    print(f"Triggers ({len(triggers)}): {', '.join(triggers)}")

    cursor.execute("SELECT COUNT(*) FROM junctions")
    j_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM roads")
    r_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM traffic_signals")
    s_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM vehicles")
    v_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM simulations")
    sim_count = cursor.fetchone()[0]

    print(f"\nBaseline Records Verified:")
    print(f"  Junctions: {j_count} | Roads: {r_count} | Signals: {s_count}")
    print(f"  Vehicles: {v_count} | Simulations: {sim_count}")
    print(f"=================================================================\n")

    conn.close()
    return True

if __name__ == '__main__':
    pwd = os.getenv('DB_PASSWORD', 'Kshitij@15')
    user = os.getenv('DB_USER', 'root')
    host = os.getenv('DB_HOST', '127.0.0.1')
    port = int(os.getenv('DB_PORT', 3306))
    success = init_database(host=host, port=port, user=user, password=pwd)
    sys.exit(0 if success else 1)
