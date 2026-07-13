from __future__ import annotations

import re
from collections.abc import Callable

from app.services.arena.types import VerificationResult, result
from app.services.challenge_metadata_service import ChallengeMetadata


class AppSecValidator:
    """Deterministic validators for the curated AppSec Fortress labs."""

    def supports(self, challenge_id: str, metadata: ChallengeMetadata | None) -> bool:
        return challenge_id.startswith("APPSEC_")

    def verify(self, code: str, metadata: ChallengeMetadata | None) -> VerificationResult:
        challenge_id = metadata.id if metadata else ""
        if _is_noise(code):
            return result(False, "Verification failed: submit a concrete remediation, not a comment or placeholder.")

        verifier = _VERIFIERS.get(challenge_id)
        if verifier is None:
            return result(False, "Unknown AppSec challenge. Verification failed closed.")
        return verifier(code)


def _is_noise(code: str) -> bool:
    stripped = code.strip()
    if not stripped:
        return True
    compact = re.sub(r"[\s#/<>\-!*]+", " ", stripped.lower()).strip()
    return compact in {"fixed", "fix", "secure", "secured", "done"} or (
        len(stripped.splitlines()) == 1 and compact.endswith(" fixed")
    )


def _has_any(text: str, *terms: str) -> bool:
    return any(term in text for term in terms)


def _version_tuple(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in re.findall(r"\d+", version)[:4])


def _has_version_at_least(code: str, package: str, minimum: str) -> bool:
    pattern = rf"{re.escape(package)}[^\d<>=~^]*[~^<>=\s:\"]*([0-9]+(?:\.[0-9]+)+)"
    match = re.search(pattern, code, re.IGNORECASE)
    return bool(match and _version_tuple(match.group(1)) >= _version_tuple(minimum))


def _verify_sqli(code: str) -> VerificationResult:
    lowered = code.lower()
    if _has_any(lowered, "f\"select", "f'select", ".format(", " + user", "+ user_", "% user", "execute(query)"):
        return result(False, "Attack Success! SQL is still assembled from user-controlled input.")
    has_placeholder = _has_any(code, "?", "%s") or re.search(r":[a-zA-Z_][a-zA-Z0-9_]*", code)
    if "execute" in lowered and "select" in lowered and has_placeholder and "," in code:
        return result(True, "Defense Active. Parameterized SQL execution verified.")
    return result(False, "Verification failed: parameterized query placeholders and bound variables are required.")


def _verify_xss(code: str) -> VerificationResult:
    lowered = code.lower()
    if _has_any(lowered, "| safe", "dangerouslysetinnerhtml", "innerhtml", "v-html", "markupsafe.markup("):
        return result(False, "Attack Success! Raw HTML rendering remains enabled.")
    if ("{{" in code and "}}" in code) or _has_any(lowered, "escape(", "html.escape", "bleach.clean", "sanitize("):
        return result(True, "Defense Active. Escaped or sanitized output verified.")
    return result(False, "Verification failed: escaped rendering or sanitization is required.")


def _verify_command_injection(code: str) -> VerificationResult:
    lowered = code.lower()
    if _has_any(lowered, "os.system", "shell=true", "exec(", "eval("):
        return result(False, "Attack Success! Unsafe shell execution remains.")
    if "subprocess" in lowered and _has_any(lowered, "allowlist", "allowed", "whitelist", "validate") and (
        "shell=false" in lowered or "[" in code
    ):
        return result(True, "Defense Active. Allowlisted subprocess execution verified.")
    return result(False, "Verification failed: use subprocess with an allowlist and no shell.")


def _verify_path_traversal(code: str) -> VerificationResult:
    lowered = code.lower()
    if "../" in code and not _has_any(lowered, "reject", "raise", "abort"):
        return result(False, "Attack Success! Traversal sequences are still accepted.")
    has_resolution = _has_any(lowered, "resolve(", "normalize(", "basename(", "realpath", "path.resolve", "safe_join")
    has_boundary = _has_any(lowered, "startswith", "relative(", "commonpath", "base_dir", "allowed_dir", "reject", "abort")
    if has_resolution and has_boundary:
        return result(True, "Defense Active. Safe path resolution and boundary checks verified.")
    return result(False, "Verification failed: resolve the path and enforce the allowed directory boundary.")


def _verify_deserialization(code: str) -> VerificationResult:
    lowered = code.lower()
    if _has_any(lowered, "pickle.loads", "pickle.load(", "yaml.load(", "objectinputstream", "readobject("):
        return result(False, "Attack Success! Unsafe deserialization remains.")
    if _has_any(lowered, "json.loads", "json.parse") and _has_any(lowered, "schema", "pydantic", "basemodel", "validate", "marshmallow"):
        return result(True, "Defense Active. Trusted schema parsing verified.")
    return result(False, "Verification failed: parse trusted data with schema validation.")


def _verify_hardcoded_secret(code: str) -> VerificationResult:
    lowered = code.lower()
    if _has_any(lowered, "hardcoded_secret", "sk_live_", "api_key = \"", "token = \"", "password = \""):
        return result(False, "Attack Success! Literal secret material remains in code.")
    if _has_any(lowered, "os.environ", "getenv(", "process.env", "secretsmanager", "secretmanager", "vault", "ssm_parameter"):
        return result(True, "Defense Active. Secret is sourced from a managed runtime location.")
    return result(False, "Verification failed: load the secret from environment or a secret provider.")


def _verify_idor(code: str) -> VerificationResult:
    lowered = code.lower()
    if "invoice.get(id=invoice_id)" in lowered and not _has_any(lowered, "owner", "current_user", "user_id"):
        return result(False, "Attack Success! Object lookup is not scoped to the caller.")
    if _has_any(lowered, "owner_id", "user_id", "tenant_id") and _has_any(lowered, "current_user", "request.user", "principal"):
        return result(True, "Defense Active. Object ownership authorization verified.")
    return result(False, "Verification failed: enforce object ownership for the current user.")


def _verify_jwt(code: str) -> VerificationResult:
    lowered = code.lower()
    if _has_any(lowered, "verify_signature\": false", "verify_signature': false", "algorithms=[\"none\"]", "algorithms=['none']"):
        return result(False, "Attack Success! JWT signature or algorithm validation is disabled.")
    if "jwt.decode" in lowered and "algorithms" in lowered and _has_any(lowered, "issuer", "audience"):
        return result(True, "Defense Active. JWT algorithm, issuer, and audience checks verified.")
    return result(False, "Verification failed: configure algorithm allowlist, issuer, and audience validation.")


def _verify_role_check(code: str) -> VerificationResult:
    lowered = code.lower()
    if _has_any(lowered, "is_admin", "require_admin", "role == \"admin\"", "role == 'admin'", "has_permission", "admin_required"):
        return result(True, "Defense Active. Administrative authorization check verified.")
    return result(False, "Verification failed: require an administrator role or permission before the action.")


def _verify_mass_assignment(code: str) -> VerificationResult:
    lowered = code.lower()
    if _has_any(lowered, "object.assign(user, req.body", "...req.body", "setattr(user", "update(req.body"):
        return result(False, "Attack Success! Request body fields are still mass-assigned.")
    if _has_any(lowered, "allowed_fields", "allowlist", "pick(", "dto", "schema") and _has_any(lowered, "displayname", "timezone", "email", "profile"):
        return result(True, "Defense Active. Field allowlist or DTO update verified.")
    return result(False, "Verification failed: use a DTO or explicit field allowlist.")


def _verify_rate_limit(code: str) -> VerificationResult:
    lowered = code.lower()
    if _has_any(lowered, "rate_limit", "ratelimit", "limiter", "throttle") and _has_any(lowered, "minute", "window", "per_second", "per_minute") and _has_any(lowered, "ip", "user", "username"):
        return result(True, "Defense Active. Authentication throttling policy verified.")
    return result(False, "Verification failed: add a bounded throttle keyed by account or source.")


def _verify_ssrf(code: str) -> VerificationResult:
    lowered = code.lower()
    if "requests.get" in lowered and not _has_any(lowered, "allowlist", "allowed_hosts", "ipaddress", "is_private"):
        return result(False, "Attack Success! Arbitrary outbound URL fetch remains.")
    has_allowlist = _has_any(lowered, "allowlist", "allowed_hosts", "approved_hosts")
    blocks_private = _has_any(lowered, "is_private", "is_loopback", "localhost", "169.254", "10.0.0.0", "private")
    if has_allowlist and blocks_private:
        return result(True, "Defense Active. SSRF host allowlist and private IP rejection verified.")
    return result(False, "Verification failed: require URL allowlist and private network rejection.")


def _verify_npm(code: str) -> VerificationResult:
    if _has_version_at_least(code, "lodash", "4.17.21"):
        return result(True, "Defense Active. Patched npm dependency version verified.")
    return result(False, "Verification failed: lodash must be upgraded to at least 4.17.21.")


def _verify_pypi(code: str) -> VerificationResult:
    if _has_version_at_least(code, "PyYAML", "5.4"):
        return result(True, "Defense Active. Patched PyPI dependency version verified.")
    return result(False, "Verification failed: PyYAML must be upgraded to a patched version.")


def _verify_maven(code: str) -> VerificationResult:
    if _has_version_at_least(code, "log4j-core", "2.17.1") or _has_version_at_least(code, "<version>", "2.17.1"):
        return result(True, "Defense Active. Patched Maven dependency version verified.")
    return result(False, "Verification failed: Log4j must be upgraded to 2.17.1 or later.")


def _verify_typosquat(code: str) -> VerificationResult:
    lowered = code.lower()
    if "reqeust" in lowered:
        return result(False, "Attack Success! Typosquatted package remains.")
    if re.search(r'"request"\s*:', code) or re.search(r"'request'\s*:", code) or '"axios"' in code:
        return result(True, "Defense Active. Legitimate dependency replacement verified.")
    return result(False, "Verification failed: replace the lookalike package with a trusted dependency.")


def _verify_postinstall(code: str) -> VerificationResult:
    lowered = code.lower()
    if _has_any(lowered, "curl ", "| bash", "postinstall") and not _has_any(lowered, "ignore-scripts", "allow-scripts", "trusteddependencies"):
        return result(False, "Attack Success! Untrusted lifecycle script can still execute.")
    if _has_any(lowered, "ignore-scripts=true", "ignore-scripts = true", "allow-scripts", "trusteddependencies", "package policy"):
        return result(True, "Defense Active. Dependency lifecycle script policy verified.")
    return result(False, "Verification failed: disable or explicitly govern install scripts.")


def _verify_digest_pin(code: str) -> VerificationResult:
    if re.search(r"from\s+[\w./:-]+@sha256:[a-f0-9]{32,64}", code, re.IGNORECASE):
        return result(True, "Defense Active. Immutable base image digest verified.")
    return result(False, "Verification failed: pin the base image by sha256 digest.")


def _verify_non_root(code: str) -> VerificationResult:
    lowered = code.lower()
    if "runasuser: 0" in lowered or "runasnonroot: false" in lowered:
        return result(False, "Attack Success! Container still runs as root.")
    if "runasnonroot: true" in lowered and re.search(r"runAsUser:\s*(?!0\b)\d+", code):
        return result(True, "Defense Active. Non-root container user verified.")
    return result(False, "Verification failed: set runAsNonRoot true and a non-zero runAsUser.")


def _verify_privileged(code: str) -> VerificationResult:
    lowered = code.lower()
    if "privileged: true" in lowered or "allowprivilegeescalation: true" in lowered:
        return result(False, "Attack Success! Privileged execution remains enabled.")
    if "privileged: false" in lowered and "allowprivilegeescalation: false" in lowered and "drop:" in lowered and "all" in lowered:
        return result(True, "Defense Active. Privilege and capability hardening verified.")
    return result(False, "Verification failed: disable privileged mode, block escalation, and drop ALL capabilities.")


def _verify_readonly_root(code: str) -> VerificationResult:
    lowered = code.lower()
    if "readonlyrootfilesystem: false" in lowered:
        return result(False, "Attack Success! Root filesystem remains writable.")
    if "readonlyrootfilesystem: true" in lowered:
        return result(True, "Defense Active. Read-only root filesystem verified.")
    return result(False, "Verification failed: set readOnlyRootFilesystem to true.")


def _verify_resources(code: str) -> VerificationResult:
    lowered = code.lower()
    if all(term in lowered for term in ("resources:", "requests:", "limits:", "cpu:", "memory:")):
        return result(True, "Defense Active. CPU and memory requests and limits verified.")
    return result(False, "Verification failed: add CPU and memory requests and limits.")


def _verify_secret_mount(code: str) -> VerificationResult:
    lowered = code.lower()
    if "secretname:" in lowered and "items:" not in lowered:
        return result(False, "Attack Success! Entire secret remains mounted.")
    if "secretname:" in lowered and "items:" in lowered and _has_any(lowered, "defaultmode: 0400", "defaultmode: 256", "readonly: true", "readOnly: true".lower()):
        return result(True, "Defense Active. Least-privilege secret mount verified.")
    return result(False, "Verification failed: mount only required secret keys with read-only permissions.")


def _verify_network_policy(code: str) -> VerificationResult:
    lowered = code.lower()
    has_policy = "kind: networkpolicy" in lowered
    has_default_deny = "policytypes:" in lowered and _has_any(lowered, "ingress", "egress") and re.search(r"ingress:\s*\[\]", lowered)
    has_allow = _has_any(lowered, "podselector", "namespaceselector", "from:")
    if has_policy and (has_default_deny or "default-deny" in lowered) and has_allow:
        return result(True, "Defense Active. Default-deny network policy with explicit allowlist verified.")
    return result(False, "Verification failed: add a deny-by-default NetworkPolicy and explicit allow rule.")


_VERIFIERS: dict[str, Callable[[str], VerificationResult]] = {
    "APPSEC_SAST_001": _verify_sqli,
    "APPSEC_SAST_002": _verify_xss,
    "APPSEC_SAST_003": _verify_command_injection,
    "APPSEC_SAST_004": _verify_path_traversal,
    "APPSEC_SAST_005": _verify_deserialization,
    "APPSEC_SAST_006": _verify_hardcoded_secret,
    "APPSEC_AUTH_001": _verify_idor,
    "APPSEC_AUTH_002": _verify_jwt,
    "APPSEC_AUTH_003": _verify_role_check,
    "APPSEC_AUTH_004": _verify_mass_assignment,
    "APPSEC_AUTH_005": _verify_rate_limit,
    "APPSEC_AUTH_006": _verify_ssrf,
    "APPSEC_SUPPLY_001": _verify_npm,
    "APPSEC_SUPPLY_002": _verify_pypi,
    "APPSEC_SUPPLY_003": _verify_maven,
    "APPSEC_SUPPLY_004": _verify_typosquat,
    "APPSEC_SUPPLY_005": _verify_postinstall,
    "APPSEC_SUPPLY_006": _verify_digest_pin,
    "APPSEC_K8S_001": _verify_non_root,
    "APPSEC_K8S_002": _verify_privileged,
    "APPSEC_K8S_003": _verify_readonly_root,
    "APPSEC_K8S_004": _verify_resources,
    "APPSEC_K8S_005": _verify_secret_mount,
    "APPSEC_K8S_006": _verify_network_policy,
}
