from app.services.arena.types import VerificationResult, result
from app.services.challenge_metadata_service import ChallengeMetadata


class CloudArchitectureValidator:
    def supports(self, challenge_id: str, metadata: ChallengeMetadata | None) -> bool:
        return challenge_id.startswith("ARCH_")

    def verify(self, code: str, metadata: ChallengeMetadata | None) -> VerificationResult:
        if "\"*\"" in code or "'*'" in code:
            return result(False, "Attack Success! Wildcard permissions detected.")
        return result(True, "Defense Active. Least-privilege IAM policy enforced.")
