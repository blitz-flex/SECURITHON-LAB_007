from app.services.arena.types import VerificationResult, result
from app.services.challenge_metadata_service import ChallengeMetadata


class KubernetesValidator:
    def supports(self, challenge_id: str, metadata: ChallengeMetadata | None) -> bool:
        return challenge_id.startswith("K8S_")

    def verify(self, code: str, metadata: ChallengeMetadata | None) -> VerificationResult:
        bad_patterns = [
            "PrivilegeEscalation: true",
            "hostPID: true",
            "hostIPC: true",
            "hostNetwork: true",
            "runAsUser: 0",
            "automountServiceAccountToken: true",
        ]
        if any(bad in code for bad in bad_patterns):
            return result(False, "Attack Success! Pod spec allows excessive privileges.")
        return result(True, "Defense Active. Kubernetes manifest secured.")
