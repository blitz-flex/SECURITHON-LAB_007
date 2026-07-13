from app.services.arena.types import VerificationResult, result
from app.services.challenge_metadata_service import ChallengeMetadata


class IdentityValidator:
    def supports(self, challenge_id: str, metadata: ChallengeMetadata | None) -> bool:
        return challenge_id.startswith("ID_")

    def verify(self, code: str, metadata: ChallengeMetadata | None) -> VerificationResult:
        if "HARDCODED_SECRET_VALUE" in code:
            return result(False, "Attack Success! Sensitive credentials found in plaintext.")
        return result(True, "Defense Active. Secret handled securely.")
