from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.services.challenge_metadata_service import ChallengeMetadata


@dataclass(frozen=True)
class VerificationResult:
    success: bool
    message: str


class Validator(Protocol):
    def supports(self, challenge_id: str, metadata: ChallengeMetadata | None) -> bool:
        ...

    def verify(self, code: str, metadata: ChallengeMetadata | None) -> VerificationResult:
        ...


def result(success: bool, message: str) -> VerificationResult:
    return VerificationResult(success=success, message=message)
