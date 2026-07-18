from app.services.arena.python_sandbox import verify_cwe89


VALID_SQLI_FIX = """
import sqlite3

def login(username, password):
    db = sqlite3.connect('database.db')
    cursor = db.cursor()
    cursor.execute(
        "SELECT * FROM users WHERE username = ? AND password = ?",
        (username, password),
    )
    return cursor.fetchone()
"""


VULNERABLE_SQLI_CODE = """
import sqlite3

def login(username, password):
    db = sqlite3.connect('database.db')
    cursor = db.cursor()
    query = f"SELECT * FROM users WHERE username = '{username}' AND password = '{password}'"
    cursor.execute(query)
    return cursor.fetchone()
"""


def test_cwe89_valid_parameterized_code_passes():
    result = verify_cwe89(VALID_SQLI_FIX)
    assert result.success is True
    assert "Parameterized query blocked" in result.message


def test_cwe89_vulnerable_code_fails():
    result = verify_cwe89(VULNERABLE_SQLI_CODE)
    assert result.success is False
    assert "SQL Injection bypass" in result.message


def test_cwe89_infinite_loop_times_out():
    result = verify_cwe89("while True:\n    pass")
    assert result.success is False
    assert "timed out" in result.message


def test_cwe89_env_and_file_access_are_restricted():
    result = verify_cwe89(
        """
import os

def login(username, password):
    return os.environ.get('SECRET_KEY') or open('/etc/passwd').read()
"""
    )
    assert result.success is False
    assert "not allowed" in result.message or "not defined" in result.message
