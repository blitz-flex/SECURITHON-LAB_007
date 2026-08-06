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

        m = re.match(r"^LIVE_REAL_(CVE-.+)$", challenge_id)
        if not m:
            return result(False, "Unknown live challenge. Verification failed closed.")

        cve_id = m.group(1)
        items = _cisa_kev_cache.get("items", [])
        
        target_threat = None
        for item in items:
            if item.get("cveID") == cve_id:
                target_threat = item
                break
                
        if not target_threat:
            return result(False, "Unknown live challenge. Verification failed closed.")

        scenario = _match_scenario(_threat_text(target_threat))

        if not scenario:
            scenario = _DEFAULT_SCENARIO

        file_name = scenario.get("file", "")
        lowered = code.lower()

        if file_name == "TeamCityAuthDeserializer.java":
            if "readObject" in code and "ObjectInputFilter" not in code and "json" not in lowered:
                return result(False, "Attack Success! Unsafe readObject() allows arbitrary code execution.")
            return result(True, "Defense Active. Java Deserialization safely mitigated.")

        elif file_name == "TomcatFileUploadServlet.java":
            if ".toLowerCase().endsWith(\".jsp\")" in code and ".jspx" not in lowered:
                return result(False, "Attack Success! The filter can be bypassed with .jspx or mixed case extensions.")
            if "endsWith(\".jsp\")" not in code and "toLowerCase" in code and ("deny" in lowered or "block" in lowered or "return" in lowered):
                return result(True, "Defense Active. Malicious Tomcat file uploads blocked.")
            return result(True, "Defense Active. Upload filter successfully hardened.")

        elif file_name == "Log4jLookupHandler.java":
            if "context.lookup(" in code and "java:" not in lowered and "jndi:" in lowered:
                return result(False, "Attack Success! Unsafe JNDI lookup still points to arbitrary sources.")
            return result(True, "Defense Active. JNDI lookups sanitized for Log4Shell prevention.")

        elif file_name == "SpringDataQueryController.java":
            if "+" in code and ("'\"" in code or "\"'" in code):
                return result(False, "Attack Success! String concatenation in JPQL query allows SQL Injection.")
            if "setParameter" in code or "@Param" in code:
                return result(True, "Defense Active. Spring Data query is safely parameterized.")
            return result(False, "Verification failed: Query must use setParameter or named bindings.")

        elif file_name == "FlaskSqliHandler.py":
            if "f\"SELECT" in code or "f'SELECT" in code:
                return result(False, "Attack Success! f-string interpolation leaves SQL Injection open.")
            if "?" in code or "%s" in code or ":" in code:
                return result(True, "Defense Active. Python SQL query is safely parameterized.")
            return result(False, "Verification failed: Database query is not parameterized.")

        elif file_name == "SubprocessExecutor.py":
            if "os.system" in code:
                return result(False, "Attack Success! Remote Code Execution vulnerability still exploitable via os.system.")
            if "subprocess" in lowered and ("run" in lowered or "popen" in lowered) and ("[" in code or "split" in code):
                return result(True, "Defense Active. System command execution sandbox applied via subprocess.")
            return result(False, "Verification failed: Subprocess command execution is not safely array-bound.")

        elif file_name == "ExpressPathSanitizer.js":
            if "../" in code:
                return result(False, "Attack Success! Directory Traversal remains possible.")
            if "path.basename" in code or "startsWith" in code or "normalize" in code:
                return result(True, "Defense Active. Express.js path traversal validation confirmed.")
            return result(False, "Verification failed: Path input is not sanitized using safe Node.js path APIs.")

        elif file_name == "IamLeastPrivilege.tf":
            if "Principal = \"*\"" in code or "Action = \"*\"" in code:
                return result(False, "Attack Success! Wildcard permission policy remains active.")
            if "*" not in code and "aws_iam_role" in lowered:
                return result(True, "Defense Active. Terraform IAM policy properly constrained.")
            return result(True, "Defense Active. Terraform IAM policy properly constrained.")

        elif file_name == "K8sHardenedPod.yaml":
            if "privileged: true" in code or "allowPrivilegeEscalation: true" in code:
                return result(False, "Attack Success! Kubernetes Pod remains privileged.")
            if "privileged: false" in lowered or "runAsNonRoot: true" in lowered:
                return result(True, "Defense Active. Kubernetes Pod security context hardened.")
            return result(False, "Verification failed: Container privileges must be explicitly dropped.")

        elif file_name == "SsrfMetadataFetcher.py":
            if "169.254.169.254" not in code and "10." not in code and "192.168" not in code and "172." not in code:
                return result(False, "Attack Success! SSRF allows querying internal metadata IP ranges.")
            if "169.254" in code and ("block" in lowered or "deny" in lowered or "error" in lowered or "return" in lowered or "raise" in lowered):
                return result(True, "Defense Active. SSRF protection layer implemented.")
            return result(True, "Defense Active. SSRF metadata endpoint safely blocked.")

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
