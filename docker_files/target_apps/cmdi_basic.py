"""
Vulnerable Target: Command Injection (CWE-78)
Challenge: cmdi_basic

A Flask "ping utility" that passes user input directly to os.system().
The attacker must use command injection to read /etc/flag.txt.
"""
import os
import subprocess
from flask import Flask, request, jsonify

app = Flask(__name__)

# Write the flag file
FLAG_PATH = "/tmp/flag.txt"
with open(FLAG_PATH, "w") as f:
    f.write("FLAG{c0mm4nd_1nj3ct10n_0wn3d}\n")


@app.route("/")
def index():
    return jsonify({
        "service": "PingUtil API v2.1",
        "endpoints": {
            "GET /ping?host=<host>": "Ping a host and return results",
            "GET /health": "Health check"
        },
        "hint": "Try: /ping?host=127.0.0.1"
    })


@app.route("/health")
def health():
    return jsonify({"status": "running", "challenge": "cmdi_basic"})


@app.route("/ping")
def ping():
    """
    INTENTIONALLY VULNERABLE to Command Injection.
    User-supplied 'host' is passed directly to the shell.
    """
    host = request.args.get("host", "")
    
    if not host:
        return jsonify({"error": "host parameter required"}), 400
    
    # ⚠️ VULNERABLE CODE — Direct shell=True with user input
    cmd = f"ping -c 2 {host}"
    
    try:
        result = subprocess.check_output(
            cmd, shell=True, stderr=subprocess.STDOUT,
            timeout=5
        ).decode(errors="ignore")
        return jsonify({"command": cmd, "output": result})
    except subprocess.TimeoutExpired:
        return jsonify({"command": cmd, "error": "Command timed out"}), 504
    except subprocess.CalledProcessError as e:
        return jsonify({"command": cmd, "output": e.output.decode(errors="ignore"), "exit_code": e.returncode})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print("[TARGET] Command Injection lab running on port 5000")
    print("[TARGET] Try: curl 'http://target/ping?host=127.0.0.1'")
    app.run(host="0.0.0.0", port=5000, debug=False)
