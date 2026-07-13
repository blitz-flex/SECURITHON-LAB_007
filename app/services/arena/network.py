from app.services.arena.types import VerificationResult, result
from app.services.challenge_metadata_service import ChallengeMetadata


class NetworkValidator:
    def supports(self, challenge_id: str, metadata: ChallengeMetadata | None) -> bool:
        return challenge_id.startswith("NET_")

    def verify(self, code: str, metadata: ChallengeMetadata | None) -> VerificationResult:
        if "0.0.0.0/0" in code:
            return result(False, "Attack Success! Port is still exposed to the public internet.")
        return result(True, "Defense Active. Ingress restricted.")
