import json
import os

curriculum = [
    {
        "level": 1,
        "difficulty": "Medium",
        "category": "Web Security",
        "id": "cwe89",
        "title": "SQL Injection (CWE-89)",
        "description": "SQL Injection allows an attacker to bypass authentication and query unauthorized data.",
        "real_source": "Local Lab Engine",
        "cvss": 7.5,
        "cwe": "CWE-89",
        "task": "Fix the SQL query by parameterizing the input.",
        "file_context": "auth_service.py",
        "briefing": "SQL Injection (CWE-89) occurs when untrusted data is inserted directly into a database query. Attackers can use this to read sensitive data, modify database records, or even gain administrative control.",
        "hint": "Use parameterized queries or prepared statements. Pass parameters as a tuple: cur.execute(\"SELECT * FROM users WHERE username = ? AND password = ?\", (username, password))",
        "vulnCode": [
            {"n": 1, "t": "import sqlite3", "vuln": False},
            {"n": 2, "t": "", "vuln": False},
            {"n": 3, "t": "def login(username, password):", "vuln": False},
            {"n": 4, "t": "    db = sqlite3.connect('database.db')", "vuln": False},
            {"n": 5, "t": "    cursor = db.cursor()", "vuln": False},
            {"n": 6, "t": "    # Vulnerable SQL Query", "vuln": False},
            {"n": 7, "t": "    query = f\"SELECT * FROM users WHERE username = '{username}' AND password = '{password}'\"", "vuln": True},
            {"n": 8, "t": "    cursor.execute(query)", "vuln": False},
            {"n": 9, "t": "    return cursor.fetchone()", "vuln": False}
        ]
    },
    {
        "level": 2,
        "difficulty": "Medium",
        "category": "Web Security",
        "id": "cwe79",
        "title": "Cross-Site Scripting (CWE-79)",
        "description": "XSS allows an attacker to inject malicious scripts into web pages.",
        "real_source": "Local Lab Engine",
        "cvss": 6.1,
        "cwe": "CWE-79",
        "task": "Secure the user bio output against HTML injection.",
        "file_context": "profile.html",
        "briefing": "Cross-Site Scripting (XSS) allows attackers to inject malicious scripts into web pages viewed by other users. The 'safe' filter often bypasses the template engine's auto-escaping, leading to vulnerability.",
        "hint": "Remove the '| safe' filter or use a specific sanitizer for HTML content.",
        "vulnCode": [
            {"n": 1, "t": "<div class=\"user-profile\">", "vuln": False},
            {"n": 2, "t": "    <h1>User Profile</h1>", "vuln": False},
            {"n": 3, "t": "    <div class=\"bio-section\">", "vuln": False},
            {"n": 4, "t": "        <p class=\"bio-content\">{{ user.bio | safe }}</p>", "vuln": True},
            {"n": 5, "t": "    </div>", "vuln": False},
            {"n": 6, "t": "</div>", "vuln": False}
        ]
    },
    {
        "level": 3,
        "difficulty": "High",
        "category": "Identity & Access",
        "id": "cwe287",
        "title": "Broken Authentication (CWE-287)",
        "description": "Insecure session cookie handling allows user impersonation and session hijacking.",
        "real_source": "Local Lab Engine",
        "cvss": 7.5,
        "cwe": "CWE-287",
        "task": "Harden the session validation check by using signed cookies.",
        "file_context": "session_middleware.js",
        "briefing": "Broken Authentication (CWE-287) occurs when session cookies are not validated or signed, allowing attackers to forge session identifiers and gain unauthorized access.",
        "hint": "Harden the session validation check. Ensure cookies are signed and verified: verify the cookies signature.",
        "vulnCode": [
            {"n": 1, "t": "function authMiddleware(req, res, next) {", "vuln": False},
            {"n": 2, "t": "    const cookies = parseCookies(req.headers.cookie);", "vuln": False},
            {"n": 3, "t": "    const sessionId = cookies['session_id'];", "vuln": False},
            {"n": 4, "t": "    if (sessionId) {", "vuln": False},
            {"n": 5, "t": "        req.user = getUserFromSession(sessionId);", "vuln": True},
            {"n": 6, "t": "    }", "vuln": False},
            {"n": 7, "t": "    next();", "vuln": False},
            {"n": 8, "t": "}", "vuln": False}
        ]
    }
]

output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "api", "v1", "endpoints")
output_path = os.path.join(output_dir, "curriculum.json")

with open(output_path, "w") as f:
    json.dump(curriculum, f, indent=4)

print(f"Generated {len(curriculum)} challenges.")
