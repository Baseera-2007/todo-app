from flask import Flask, jsonify, request, render_template
import sqlite3
from database import get_db_connection, init_db

app = Flask(__name__)

# Initialize database schema on startup
init_db()

@app.route('/')
def index():
    """Serve the single-page application frontend."""
    return render_template('index.html')

@app.route('/tasks', methods=['GET'])
def get_tasks():
    """Retrieve all tasks sorted by active status (uncompleted first) and creation date (newest first)."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        # Order by completed ASC (0 = False, 1 = True) so active tasks appear first,
        # then by created_at DESC to show newest tasks first.
        cursor.execute("SELECT id, title, completed, created_at, due_date FROM tasks ORDER BY completed ASC, created_at DESC")
        rows = cursor.fetchall()
        tasks = [dict(row) for row in rows]
        # Convert SQLite's integer representation (0/1) to true boolean values for JSON response
        for task in tasks:
            task['completed'] = bool(task['completed'])
        return jsonify(tasks), 200
    except sqlite3.Error as e:
        return jsonify({"error": f"Database query failed: {str(e)}"}), 500
    finally:
        conn.close()

@app.route('/tasks', methods=['POST'])
def create_task():
    """Add a new task. Expects a JSON body with 'title' and optional 'due_date'."""
    data = request.get_json() or {}
    title = data.get('title', '').strip()
    due_date = data.get('due_date', '').strip() or None

    if not title:
        return jsonify({"error": "Task title is required"}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO tasks (title, completed, due_date) VALUES (?, ?, ?)",
            (title, 0, due_date)
        )
        conn.commit()
        task_id = cursor.lastrowid
        
        # Retrieve the newly inserted task to return complete information including defaults
        cursor.execute("SELECT id, title, completed, created_at, due_date FROM tasks WHERE id = ?", (task_id,))
        row = cursor.fetchone()
        if row:
            task = dict(row)
            task['completed'] = bool(task['completed'])
            return jsonify(task), 201
        return jsonify({"error": "Failed to retrieve created task"}), 500
    except sqlite3.Error as e:
        return jsonify({"error": f"Database insertion failed: {str(e)}"}), 500
    finally:
        conn.close()

@app.route('/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    """Update an existing task's title, completion status, or due date."""
    data = request.get_json() or {}
    
    # Check what fields are provided in the payload
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": f"Task with ID {task_id} not found"}), 404
        
        current_task = dict(row)
        
        # Merge existing values with incoming updates
        title = data.get('title', current_task['title']).strip()
        completed = data.get('completed', current_task['completed'])
        due_date = data.get('due_date', current_task['due_date'])
        
        # Clean up empty due dates to NULL
        if due_date is not None:
            due_date = due_date.strip()
            if not due_date:
                due_date = None
                
        # Ensure completion is stored as 0 or 1
        completed_val = 1 if completed else 0

        cursor.execute(
            "UPDATE tasks SET title = ?, completed = ?, due_date = ? WHERE id = ?",
            (title, completed_val, due_date, task_id)
        )
        conn.commit()

        # Retrieve and return the updated task
        cursor.execute("SELECT id, title, completed, created_at, due_date FROM tasks WHERE id = ?", (task_id,))
        updated_row = cursor.fetchone()
        if updated_row:
            task = dict(updated_row)
            task['completed'] = bool(task['completed'])
            return jsonify(task), 200
            
        return jsonify({"error": "Failed to retrieve updated task"}), 500
    except sqlite3.Error as e:
        return jsonify({"error": f"Database update failed: {str(e)}"}), 500
    finally:
        conn.close()

@app.route('/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    """Remove a task from the database."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM tasks WHERE id = ?", (task_id,))
        if not cursor.fetchone():
            return jsonify({"error": f"Task with ID {task_id} not found"}), 404

        cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()
        return jsonify({"success": True, "message": "Task deleted successfully"}), 200
    except sqlite3.Error as e:
        return jsonify({"error": f"Database deletion failed: {str(e)}"}), 500
    finally:
        conn.close()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
