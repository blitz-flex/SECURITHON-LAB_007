from app.services.arena.types import VerificationResult, result
from app.services.challenge_metadata_service import ChallengeMetadata


class ContainerValidator:
    def supports(self, challenge_id: str, metadata: ChallengeMetadata | None) -> bool:
        return challenge_id.startswith("CONT_")

    def verify(self, code: str, metadata: ChallengeMetadata | None) -> VerificationResult:
        bad_patterns = [
            "USER root",
            "--privileged",
            "--net=host",
            "docker.sock",
            "latest",
            "bash",
            "-P",
            "ALL",
            "supersecret",
        ]
        if any(bad in code for bad in bad_patterns):
            return result(False, "Attack Success! Container configuration remains insecure.")
        return result(True, "Defense Active. Container runtime hardened.")
