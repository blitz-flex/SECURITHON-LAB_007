"""
Arena service facade.

Verification is delegated to the validator registry; reward and leaderboard
scoring helpers remain here for compatibility with existing callers.
"""
from __future__ import annotations

from app.services.arena.registry import verify_patch as registry_verify_patch


DIFFICULTY_REWARDS: dict[str, int] = {
    "easy": 50,
    "medium": 100,
    "hard": 200,
    "critical": 300,
}

# Credited for each genuine solve so the leaderboard keeps one sample per solve.
NEUTRAL_EFFICIENCY_SCORE = 60


class ArenaService:
    @staticmethod
    def score_clean_code(code: str) -> int:
        """Lightweight static quality score from the submitted patch text."""
        score = 100
        lowered = code.lower()
        risky_patterns = [
            "eval(",
            "exec(",
            "os.system",
            "subprocess",
            "shell=true",
            "pickle.loads",
            "yaml.load",
            "| safe",
            "0.0.0.0/0",
            "privileged: true",
            "allowprivilegeescalation: true",
        ]
        score -= sum(12 for pattern in risky_patterns if pattern in lowered)
        if len(code.splitlines()) > 120:
            score -= 8
        if "\t" in code:
            score -= 3
        if "todo" in lowered or "fixme" in lowered:
            score -= 5
        return max(0, min(100, score))

    @staticmethod
    def calculate_reward(difficulty: str, already_solved: bool) -> int:
        """Return the XP reward for a successful solve."""
        if already_solved:
            return 0
        return DIFFICULTY_REWARDS.get(difficulty.lower(), 100)

    @staticmethod
    def verify_patch(challenge_id: str, code: str) -> tuple[bool, str]:
        """Verify a submitted patch and return success status and message."""
        verification = registry_verify_patch(challenge_id, code)
        return verification.success, verification.message

    @staticmethod
    def get_base_reward(difficulty: str) -> int:
        return DIFFICULTY_REWARDS.get(difficulty.lower(), 100)
