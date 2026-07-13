from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass


SANDBOX_TIMEOUT_SECONDS = 2
MAX_OUTPUT_CHARS = 1200


@dataclass(frozen=True)
class SandboxResult:
    success: bool
    message: str


CWE89_HARNESS = r"""
import json
import sqlite3 as _sqlite3
import sys
import types

payload = json.loads(sys.stdin.read())
code = payload["code"]

def emit(success, message):
    print(json.dumps({"success": success, "message": message}))

def limited_import(name, globals=None, locals=None, fromlist=(), level=0):
    if name == "sqlite3":
        return sys.modules["sqlite3"]
    raise ImportError(f"Import '{name}' is not allowed in this verifier.")

safe_builtins = {
    "__import__": limited_import,
    "False": False,
    "True": True,
    "None": None,
    "bool": bool,
    "dict": dict,
    "int": int,
    "len": len,
    "list": list,
    "str": str,
    "tuple": tuple,
}

test_db = _sqlite3.connect(":memory:")
cur = test_db.cursor()
cur.execute("CREATE TABLE users (username TEXT, password TEXT)")
cur.execute("INSERT INTO users VALUES ('admin', 'secret_pass_123')")
test_db.commit()

fake_sqlite3 = types.ModuleType("sqlite3")
fake_sqlite3.__dict__.update(_sqlite3.__dict__)
fake_sqlite3.connect = lambda *args, **kwargs: test_db
sys.modules["sqlite3"] = fake_sqlite3

namespace = {"sqlite3": fake_sqlite3, "__builtins__": safe_builtins}
try:
    exec(code, namespace)
    login_func = namespace.get("login")
    if not login_func:
        emit(False, "Syntax error or missing 'login' function definition.")
    else:
        res_good = login_func("admin", "secret_pass_123")
        res_bad = login_func("admin", "wrong_password")
        res_exploit = login_func("admin' OR '1'='1", "anything")

        if not res_good:
            emit(False, "Verification failed: Correct credentials fail to authenticate.")
        elif res_bad:
            emit(False, "Verification failed: Wrong password bypasses authentication.")
        elif res_exploit:
            emit(False, "Exploit successful! SQL Injection bypass (' OR '1'='1) succeeded.")
        else:
            emit(True, "Defense Active! Parameterized query blocked the exploit payload.")
except Exception as exc:
    emit(False, f"Runtime Error during verification: {str(exc)}")
"""


def _limit_child_resources() -> None:
    try:
        import resource

        cpu_limit = SANDBOX_TIMEOUT_SECONDS + 1
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_limit, cpu_limit))
        memory_bytes = 128 * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
        resource.setrlimit(resource.RLIMIT_NOFILE, (16, 16))
        resource.setrlimit(resource.RLIMIT_NPROC, (1, 1))
    except Exception:
        # Resource limits are best-effort and platform-dependent; timeout still applies.
        pass


def verify_cwe89(code: str) -> SandboxResult:
    with tempfile.TemporaryDirectory(prefix="arena-verify-") as tmpdir:
        try:
            completed = subprocess.run(
                [sys.executable, "-I", "-c", CWE89_HARNESS],
                input=json.dumps({"code": code}),
                text=True,
                capture_output=True,
                cwd=tmpdir,
                env={"PYTHONIOENCODING": "utf-8"},
                timeout=SANDBOX_TIMEOUT_SECONDS,
                preexec_fn=_limit_child_resources if os.name == "posix" else None,
            )
        except subprocess.TimeoutExpired:
            return SandboxResult(False, "Runtime Error during verification: execution timed out.")

    stdout = (completed.stdout or "")[:MAX_OUTPUT_CHARS]
    stderr = (completed.stderr or "")[:MAX_OUTPUT_CHARS]
    if completed.returncode != 0 and not stdout:
        return SandboxResult(False, "Runtime Error during verification: sandbox process failed.")

    try:
        payload = json.loads(stdout.strip().splitlines()[-1])
        return SandboxResult(bool(payload["success"]), str(payload["message"]))
    except (IndexError, KeyError, json.JSONDecodeError, TypeError):
        safe_error = stderr.strip() or "sandbox returned invalid output"
        return SandboxResult(False, f"Runtime Error during verification: {safe_error[:MAX_OUTPUT_CHARS]}")
