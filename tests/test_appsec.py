from collections import Counter

from app.api.v1.endpoints.appsec import load_appsec_curriculum
from app.services.arena.registry import verify_patch
from app.services.challenge_metadata_service import get_challenge_metadata


REQUIRED_FIELDS = {
    "id",
    "level",
    "title",
    "category",
    "difficulty",
    "standard",
    "cwe",
    "cvss",
    "file_context",
    "task",
    "briefing",
    "hint",
    "vulnCode",
}


PASSING_FIXES = {
    "APPSEC_SAST_001": 'cursor.execute("SELECT * FROM logs WHERE id = ?", (user_id,))',
    "APPSEC_SAST_002": '<section class="bio">{{ user.bio }}</section>',
    "APPSEC_SAST_003": 'allowed = {"csv": ["reporter", "--format", "csv"]}\nif fmt in allowed:\n    subprocess.run(allowed[fmt], shell=False)',
    "APPSEC_SAST_004": "candidate = (base_dir / name).resolve()\nif not str(candidate).startswith(str(base_dir.resolve())):\n    abort(400)",
    "APPSEC_SAST_005": "payload = json.loads(upload.read())\njob = JobSchema.validate(payload)",
    "APPSEC_SAST_006": "PAYMENT_TOKEN = os.environ['PAYMENT_TOKEN']",
    "APPSEC_AUTH_001": "invoice = Invoice.get(id=invoice_id, owner_id=current_user.id)",
    "APPSEC_AUTH_002": 'claims = jwt.decode(token, key, algorithms=["RS256"], issuer=ISSUER, audience=AUDIENCE)',
    "APPSEC_AUTH_003": "if not current_user.is_admin:\n    raise Forbidden()\nusers.delete(user_id)",
    "APPSEC_AUTH_004": "allowed_fields = pick(req.body, ['displayName', 'timezone'])\nuser.update(allowed_fields)",
    "APPSEC_AUTH_005": "@rate_limit('5/minute', key_func=lambda req: f'{req.ip}:{req.user}')\ndef login():\n    return authenticate()",
    "APPSEC_AUTH_006": "if host not in allowed_hosts: abort(400)\nif ipaddress.ip_address(addr).is_private or host == 'localhost': abort(400)",
    "APPSEC_SUPPLY_001": '"dependencies": { "lodash": "4.17.21" }',
    "APPSEC_SUPPLY_002": "PyYAML==6.0.1",
    "APPSEC_SUPPLY_003": "<artifactId>log4j-core</artifactId><version>2.17.2</version>",
    "APPSEC_SUPPLY_004": '"dependencies": { "request": "2.88.2" }',
    "APPSEC_SUPPLY_005": "ignore-scripts=true",
    "APPSEC_SUPPLY_006": "FROM node:20-alpine@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "APPSEC_K8S_001": "securityContext:\n  runAsNonRoot: true\n  runAsUser: 10001",
    "APPSEC_K8S_002": "securityContext:\n  privileged: false\n  allowPrivilegeEscalation: false\n  capabilities:\n    drop: ['ALL']",
    "APPSEC_K8S_003": "securityContext:\n  readOnlyRootFilesystem: true",
    "APPSEC_K8S_004": "resources:\n  requests:\n    cpu: 100m\n    memory: 128Mi\n  limits:\n    cpu: 500m\n    memory: 512Mi",
    "APPSEC_K8S_005": "secret:\n  secretName: prod-secrets\n  items:\n  - key: api-token\n    path: api-token\n  defaultMode: 0400\nreadOnly: true",
    "APPSEC_K8S_006": "kind: NetworkPolicy\nmetadata:\n  name: default-deny-with-api-allow\nspec:\n  podSelector: {}\n  policyTypes: [Ingress]\n  ingress:\n  - from:\n    - podSelector:\n        matchLabels:\n          role: api",
}


def _vulnerable_code(lab: dict) -> str:
    return "\n".join(line["t"] for line in lab["vulnCode"])


def test_appsec_curriculum_shape():
    labs = load_appsec_curriculum()

    assert len(labs) == 24
    assert len({lab["id"] for lab in labs}) == 24
    assert {lab["difficulty"] for lab in labs} == {"Easy", "Medium", "Hard", "Critical"}

    categories = Counter(lab["category"] for lab in labs)
    assert categories == {
        "Secure Code Analysis (SAST)": 6,
        "OWASP API & Auth Flaws": 6,
        "Dependency & Supply-Chain Review": 6,
        "Container Hardening (K8s)": 6,
    }

    for lab in labs:
        assert REQUIRED_FIELDS <= set(lab)
        assert lab["id"].startswith("APPSEC_")
        assert lab["title"]
        assert len(lab["title"]) <= 40
        assert isinstance(lab["vulnCode"], list) and lab["vulnCode"]


def test_appsec_curriculum_endpoint_registered(client):
    response = client.get("/api/v1/appsec/curriculum")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 24
    assert data[0]["id"] == "APPSEC_SAST_001"


def test_appsec_metadata_is_server_authoritative():
    metadata = get_challenge_metadata("APPSEC_SAST_001")

    assert metadata is not None
    assert metadata.difficulty == "easy"
    assert metadata.category == "Secure Code Analysis (SAST)"
    assert metadata.cwe == "CWE-89"


def test_all_appsec_validators_reject_vulnerable_snippets_and_accept_remediations():
    labs = load_appsec_curriculum()

    for lab in labs:
        challenge_id = lab["id"]
        vulnerable = verify_patch(challenge_id, _vulnerable_code(lab))
        fixed = verify_patch(challenge_id, PASSING_FIXES[challenge_id])

        assert vulnerable.success is False, challenge_id
        assert fixed.success is True, challenge_id


def test_appsec_validator_rejects_unknown_and_comment_only_submissions():
    assert verify_patch("APPSEC_SAST_999", "secure = true").success is False

    for challenge_id in ("APPSEC_SAST_001", "APPSEC_AUTH_001", "APPSEC_SUPPLY_001", "APPSEC_K8S_001"):
        assert verify_patch(challenge_id, "fixed").success is False
        assert verify_patch(challenge_id, "# vulnerability fixed").success is False


def test_arena_verify_accepts_appsec_challenge(client, normal_user):
    response = client.post(
        "/api/v1/arena/verify",
        json={"challenge_id": "APPSEC_SAST_001", "code": PASSING_FIXES["APPSEC_SAST_001"]},
        headers=normal_user["headers"],
    )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["reward"] > 0
