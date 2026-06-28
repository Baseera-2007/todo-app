import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'todo.db')

def get_db_connection():
    """Create and return a database connection with Row factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize the database and create the tasks table if it doesn't exist."""
    schema = """
    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        due_date TEXT
    );
    """
    conn = get_db_connection()
    try:
        with conn:
            conn.execute(schema)
        print("Database initialized successfully.")
    except sqlite3.Error as e:
        print(f"Error initializing database: {e}")
    finally:
        conn.close()

if __name__ == '__main__':
    init_db()
