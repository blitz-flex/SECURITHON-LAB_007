from app.services.arena.types import VerificationResult, result
from app.services.challenge_metadata_service import ChallengeMetadata


class LiveValidator:
    def supports(self, challenge_id: str, metadata: ChallengeMetadata | None) -> bool:
        return challenge_id.startswith("LIVE_")

    def verify(self, code: str, metadata: ChallengeMetadata | None) -> VerificationResult:
        challenge_id = metadata.id if metadata else ""
        lowered = code.lower()

        if challenge_id == "LIVE_0":
            if "unsafe=True" in code:
                return result(False, "Attack Success! AI model context remains vulnerable to injection.")
            return result(True, "Defense Active. Neural stream sanitized.")

        if challenge_id == "LIVE_1":
            if "2025.1" in code:
                return result(False, "Attack Success! Vulnerable PQC algorithm version detected.")
            return result(True, "Defense Active. Quantum-safe integrity verified.")

        if challenge_id == "LIVE_2":
            if "NODE_STATE.update" in code and "lock" not in lowered:
                return result(False, "Attack Success! Race condition in mesh node sync still exploitable.")
            return result(True, "Defense Active. Atomic mesh synchronization enforced.")

        if challenge_id.startswith("LIVE_REAL_"):
            return self._verify_live_real(code, challenge_id)

        return result(False, "Unknown live challenge. Verification failed closed.")

    def _verify_live_real(self, code: str, challenge_id: str) -> VerificationResult:
        import re
        from app.api.v1.endpoints.infrasec import (
            _DEFAULT_SCENARIO,
            _KEYWORD_SCENARIOS,
            _cisa_kev_cache,
            _match_scenario,
            _threat_text,
        )

        m = re.match(r"^LIVE_REAL_(\d+)$", challenge_id)
        if not m:
            return result(False, "Unknown live challenge. Verification failed closed.")

        idx = int(m.group(1)) - 100
        if idx < 0:
            return result(False, "Unknown live challenge. Verification failed closed.")

        scenario = None
        items = _cisa_kev_cache.get("items", [])
        if items and idx < len(items):
            threat = items[idx]
            scenario = _match_scenario(_threat_text(threat))

        if not scenario:
            if idx < len(_KEYWORD_SCENARIOS):
                scenario = _KEYWORD_SCENARIOS[idx]
            elif idx == len(_KEYWORD_SCENARIOS):
                scenario = _DEFAULT_SCENARIO
            else:
                return result(False, "Unknown live challenge. Verification failed closed.")

        file_name = scenario.get("file", "")
        lowered = code.lower()

        if file_name == "db_query.py":
            if "select" not in lowered or "from" not in lowered:
                return result(False, "Verification failed: Submitted code does not perform a database query.")
            if "f\"select" in lowered or "f'select" in lowered or "+\"" in lowered or "+'" in lowered or "%" in lowered:
                return result(False, "Attack Success! SQL Injection vulnerability still present.")
            if ("?" in code or "%s" in code) and "execute" in lowered:
                return result(True, "Defense Active. Parameterized database query verified.")
            return result(False, "Verification failed: Query is not parameterized.")

        elif file_name == "file_handler.js":
            if "../" in code:
                return result(False, "Attack Success! Directory Traversal remains possible.")
            if "path" in lowered and ("sanitize" in lowered or "replace" in lowered or "resolve" in lowered or "basename" in lowered or "normalize" in lowered):
                return result(True, "Defense Active. Path traversal validation confirmed.")
            return result(False, "Verification failed: Path input is not sanitized or validated.")

        elif file_name == "executor.py":
            if "os.system" in code:
                return result(False, "Attack Success! Remote Code Execution vulnerability still exploitable via os.system.")
            if "subprocess" in lowered:
                if "allowlist" in lowered or "list" in lowered or "validate" in lowered or "sanitize" in lowered or "if" in lowered:
                    return result(True, "Defense Active. System command execution sandbox applied via subprocess allowlist.")
                return result(False, "Verification failed: Subprocess command execution is not constrained with an allowlist.")
            return result(False, "Verification failed: Unsafe command execution was not safely replaced.")

        elif file_name == "s3_policy.tf":
            if "principal" not in lowered:
                return result(False, "Verification failed: Principal policy configuration is missing.")
            if "*" in code:
                return result(False, "Attack Success! Wildcard permission policy active.")
            return result(True, "Defense Active. IAM security group policy hardened.")

        elif file_name == "template.html":
            if "| safe" in code:
                return result(False, "Attack Success! Unsafe HTML output template permits XSS.")
            if "{{" in code and "}}" in code:
                return result(True, "Defense Active. HTML output auto-escaping applied.")
            if "escape" in lowered or "sanitize" in lowered:
                return result(True, "Defense Active. HTML output sanitization applied.")
            return result(False, "Verification failed: Safe escaped or sanitized output template not found.")

        elif file_name == "config_check.yml":
            if "status" not in lowered or "security_check" not in lowered:
                return result(False, "Verification failed: Hardening fields 'status' or 'security_check' are missing.")
            if "status: active" in lowered or "status: pending" in lowered:
                return result(False, "Attack Success! Status remains in an insecure/active state.")
            if "security_check: pending" in lowered:
                return result(False, "Attack Success! Security check remains pending.")
            return result(True, "Defense Active. Configuration successfully hardened.")

        elif file_name == "cloud_native_config.tf":
            if "0.0.0.0/0" in code or "public_control_plane" in lowered:
                return result(False, "Attack Success! Cloud-native resource is still publicly exposed.")
            if any(term in lowered for term in ("private", "restricted", "public_access_block", "cidr_blocks")):
                return result(True, "Defense Active. Cloud-native configuration exposure reduced.")
            return result(False, "Verification failed: Cloud-native exposure controls are missing.")

        elif file_name == "iam_secret_policy.tf":
            if "hardcoded_secret" in lowered or "action = \"*\"" in lowered or "resource = \"*\"" in lowered:
                return result(False, "Attack Success! Secret or IAM wildcard exposure remains.")
            if any(term in lowered for term in ("secretsmanager", "vault", "kms", "ssm_parameter")) and "iam" in lowered:
                return result(True, "Defense Active. Secrets and IAM policy hardened.")
            return result(False, "Verification failed: Managed secrets and least-privilege IAM controls are missing.")

        elif file_name == "zero_trust_segments.yaml":
            if "0.0.0.0/0" in code or "identity_required: false" in lowered:
                return result(False, "Attack Success! Network segment remains open or unauthenticated.")
            if "identity_required: true" in lowered and any(term in lowered for term in ("allowed_identities", "service_account", "private_cidrs", "allowed_cidrs")):
                return result(True, "Defense Active. Zero-trust segmentation enforced.")
            return result(False, "Verification failed: Identity-aware segmentation controls are missing.")

        elif file_name == "terraform_state_backend.tf":
            if "encrypt = false" in lowered:
                return result(False, "Attack Success! Terraform state remains unencrypted.")
            if "encrypt = true" in lowered and any(term in lowered for term in ("dynamodb_table", "lock", "drift", "plan -detailed-exitcode")):
                return result(True, "Defense Active. Terraform state and drift controls verified.")
            return result(False, "Verification failed: Terraform state encryption and drift detection are missing.")

        return result(False, "Unknown live challenge scenario. Verification failed closed.")
