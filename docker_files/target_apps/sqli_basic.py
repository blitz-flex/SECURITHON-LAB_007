"""
Vulnerable Target: SQL Injection (CWE-89)
Challenge: sqli_basic

A simple Flask app with a direct SQL injection vulnerability.
The attacker must find the admin password via UNION-based injection.
"""
import sqlite3
import os
from flask import Flask, request, jsonify

app = Flask(__name__)
DB_PATH = "/tmp/lab_sqli.db"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, password TEXT, role TEXT)")
    cur.execute("DELETE FROM users")
    cur.execute("INSERT INTO users VALUES (1, 'alice', 'alice123', 'user')")
    cur.execute("INSERT INTO users VALUES (2, 'bob', 'bob456', 'user')")
    cur.execute("INSERT INTO users VALUES (3, 'admin', 'FLAG{sql_1nj3ct10n_1s_d4ng3r0us}', 'admin')")
    conn.commit()
    conn.close()


@app.route("/")
def index():
    return jsonify({
        "service": "UserLookup API v1.0",
        "endpoints": {
            "GET /user?name=<name>": "Look up a user by name",
            "GET /health": "Health check"
        },
        "hint": "Try: /user?name=alice"
    })


@app.route("/health")
def health():
    return jsonify({"status": "running", "challenge": "sqli_basic"})


@app.route("/user")
def get_user():
    """
    INTENTIONALLY VULNERABLE to SQL Injection.
    The 'name' parameter is directly interpolated into the SQL query.
    """
    name = request.args.get("name", "")
    
    # ⚠️ VULNERABLE CODE — Direct string interpolation
    query = f"SELECT id, username, role FROM users WHERE username = '{name}'"
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(query)
        rows = cur.fetchall()
        conn.close()
        
        if rows:
            users = [{"id": r[0], "username": r[1], "role": r[2]} for r in rows]
            return jsonify({"found": True, "users": users, "query": query})
        else:
            return jsonify({"found": False, "users": [], "query": query})
    except Exception as e:
        return jsonify({"error": str(e), "query": query}), 500


if __name__ == "__main__":
    init_db()
    print("[TARGET] SQL Injection lab running on port 5000")
    print("[TARGET] Try: curl http://target/user?name=alice")
    app.run(host="0.0.0.0", port=5000, debug=False)
