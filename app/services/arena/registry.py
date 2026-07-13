from __future__ import annotations

from app.services.arena.appsec import AppSecValidator
from app.services.arena.cicd import CicdValidator
from app.services.arena.cloud_architecture import CloudArchitectureValidator
from app.services.arena.container import ContainerValidator
from app.services.arena.iac import IacValidator
from app.services.arena.identity import IdentityValidator
from app.services.arena.kubernetes import KubernetesValidator
from app.services.arena.legacy_cwe import LegacyCweValidator
from app.services.arena.live import LiveValidator
from app.services.arena.network import NetworkValidator
from app.services.arena.serverless import ServerlessValidator
from app.services.arena.types import Validator, VerificationResult, result
from app.services.challenge_metadata_service import ChallengeMetadata, get_challenge_metadata


VALIDATORS: tuple[Validator, ...] = (
    AppSecValidator(),
    IacValidator(),
    NetworkValidator(),
    IdentityValidator(),
    ContainerValidator(),
    KubernetesValidator(),
    CloudArchitectureValidator(),
    ServerlessValidator(),
    CicdValidator(),
    LiveValidator(),
    LegacyCweValidator(),
)


def get_validator(challenge_id: str, metadata: ChallengeMetadata | None = None) -> Validator | None:
    metadata = metadata or get_challenge_metadata(challenge_id)
    if metadata is None:
        return None
    return next((validator for validator in VALIDATORS if validator.supports(challenge_id, metadata)), None)


def verify_patch(challenge_id: str, code: str) -> VerificationResult:
    metadata = get_challenge_metadata(challenge_id)
    validator = get_validator(challenge_id, metadata)
    if validator is None:
        return result(False, "Unknown challenge. Verification failed closed.")
    return validator.verify(code, metadata)
