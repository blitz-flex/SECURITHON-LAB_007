from app.services.arena.types import VerificationResult, result
from app.services.challenge_metadata_service import ChallengeMetadata


class CicdValidator:
    def supports(self, challenge_id: str, metadata: ChallengeMetadata | None) -> bool:
        return challenge_id.startswith("CICD_")

    def verify(self, code: str, metadata: ChallengeMetadata | None) -> VerificationResult:
        bad_patterns = ["pull_request_target", "${{ github.event", "curl", "chmod +x"]
        if any(bad in code for bad in bad_patterns):
            return result(False, "Attack Success! Pipeline remains vulnerable to injection/poisoning.")
        return result(True, "Defense Active. CI/CD workflow hardened.")
