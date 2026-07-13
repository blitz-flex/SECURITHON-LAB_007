import re

from app.services.arena.types import VerificationResult, result
from app.services.challenge_metadata_service import ChallengeMetadata


class IacValidator:
    def supports(self, challenge_id: str, metadata: ChallengeMetadata | None) -> bool:
        return challenge_id.startswith("IAC_")

    def verify(self, code: str, metadata: ChallengeMetadata | None) -> VerificationResult:
        lowered = code.lower()
        if (
            re.search(r"storage_encrypted\s*=\s*true", lowered)
            or re.search(r"encrypted\s*=\s*true", lowered)
            or re.search(r"acl\s*=\s*[\"']private[\"']", lowered)
            or re.search(r"enabled\s*=\s*true", lowered)
            or re.search(r"include_global_service_events\s*=\s*true", lowered)
        ):
            return result(True, "Defense Active. IaC configuration hardened.")
        return result(False, "Exploit successful! Target resource configuration is still vulnerable.")
