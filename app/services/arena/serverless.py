from app.services.arena.types import VerificationResult, result
from app.services.challenge_metadata_service import ChallengeMetadata


class ServerlessValidator:
    def supports(self, challenge_id: str, metadata: ChallengeMetadata | None) -> bool:
        return challenge_id.startswith("SLS_")

    def verify(self, code: str, metadata: ChallengeMetadata | None) -> VerificationResult:
        bad_patterns = [
            "os.system",
            "eval(",
            "subprocess",
            "pickle.loads",
            "yaml.load",
            "db.query",
            "requests.get",
            "fs.read",
            "render_template",
        ]
        if any(bad in code for bad in bad_patterns):
            if "sanitize" not in code.lower() and "validate" not in code.lower():
                return result(False, "Attack Success! Untrusted input still flowing to sensitive sink.")
        return result(True, "Defense Active. Lambda input sanitized.")
