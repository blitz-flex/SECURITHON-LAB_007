from app.services.arena.types import VerificationResult, result
from app.services.challenge_metadata_service import ChallengeMetadata


class LegacyCweValidator:
    def supports(self, challenge_id: str, metadata: ChallengeMetadata | None) -> bool:
        return challenge_id in {"cwe89", "cwe287", "cwe79"}

    def verify(self, code: str, metadata: ChallengeMetadata | None) -> VerificationResult:
        challenge_id = metadata.id if metadata else ""
        if challenge_id == "cwe89":
            return self._verify_cwe89(code)
        if challenge_id == "cwe287":
            if "req.signedCookies" in code or "verify" in code.lower():
                return result(True, "Defense Active. Session validation enabled.")
            return result(False, "Exploit successful! Vulnerability still present in target system.")
        if challenge_id == "cwe79":
            return self._verify_cwe79(code)
        return result(False, "Unknown legacy challenge. Verification failed closed.")

    def _verify_cwe89(self, code: str) -> VerificationResult:
        from app.core.config import settings
        from app.services.arena.docker_verifier import verify_cwe89_docker

        if settings.ARENA_VERIFIER_BACKEND == "subprocess" and settings.DEV_MODE:
            from app.services.arena.python_sandbox import verify_cwe89

            sandbox_result = verify_cwe89(code)
            return result(sandbox_result.success, sandbox_result.message)

        sandbox_result = verify_cwe89_docker(code)
        return result(sandbox_result.success, sandbox_result.message)

    def _verify_cwe79(self, code: str) -> VerificationResult:
        try:
            from jinja2 import Environment

            class UserMock:
                def __init__(self, bio):
                    self.bio = bio

            exploit_bio = "<script>alert(1)</script>"
            user = UserMock(exploit_bio)

            env = Environment(autoescape=True)
            template = env.from_string(code)
            rendered_output = template.render(user=user)

            if exploit_bio in rendered_output:
                return result(
                    False,
                    "Exploit successful! Unescaped HTML tags detected in profile rendering. XSS active.",
                )
            return result(
                True,
                "Defense Active. Output sanitization / HTML escaping successfully neutralized the XSS payload.",
            )
        except Exception as e:
            return result(False, f"Runtime Error during template rendering: {str(e)}")
