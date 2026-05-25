"""
SECURATION LAB — Multi-Container Lab Engine
==========================================
Manages two-container attack labs:
  1. AttackBox: The operator's terminal (already exists as seclab-terminal)
  2. Target: The vulnerable server the operator attacks

Architecture:
  - Each lab session gets a private Docker bridge network
  - AttackBox can reach Target via hostname "target"
  - Target is NOT exposed to the internet or other sessions
  - All containers are auto-cleaned on session end

Lifecycle:
  - Each lab session has a 1-hour default expiry
  - Sessions can be extended up to a hard maximum of 3 hours
  - An async cleanup worker auto-removes expired sessions every 30s
"""
import asyncio
import logging
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Images
# ─────────────────────────────────────────────────────────────
ATTACKBOX_IMAGE = "seclab-terminal:latest"
TARGET_IMAGE    = "seclab-target:latest"

# Label used to find and clean up all our containers
LAB_LABEL = "seclab-managed"

# ─────────────────────────────────────────────────────────────
# Session time constants
# ─────────────────────────────────────────────────────────────
DEFAULT_SESSION_MINUTES = 15        # 15 minutes default
MAX_SESSION_MINUTES     = 180       # 3 hour hard cap
CLEANUP_INTERVAL_SECS   = 30       # background sweep interval

# ─────────────────────────────────────────────────────────────
# Container resource limits (safe defaults)
# ─────────────────────────────────────────────────────────────
ATTACKBOX_LIMITS = {
    "mem_limit": "256m",
    "auto_remove": False,
}

TARGET_LIMITS = {
    "mem_limit": "128m",
    "auto_remove": False,
    "read_only": False,
}


# ─────────────────────────────────────────────────────────────
# Lab Session dataclass
# ─────────────────────────────────────────────────────────────
class LabSession:
    """Holds references to all Docker objects for one user lab."""
    def __init__(self, session_id: str, challenge_id: str = ""):
        self.session_id   = session_id
        self.network      = None   # docker.models.networks.Network
        self.attackbox    = None   # docker.models.containers.Container
        self.target       = None   # docker.models.containers.Container
        self.challenge_id = challenge_id
        # Keep old attribute name for backward-compat
        self.challenge    = challenge_id
        self.created_at   = datetime.utcnow()
        self.expiry_time  = datetime.utcnow() + timedelta(minutes=DEFAULT_SESSION_MINUTES)
        self.status       = "spawning"   # "spawning" | "online" | "offline"

    @property
    def remaining_seconds(self) -> int:
        """Returns seconds remaining until expiry, floored at 0."""
        delta = (self.expiry_time - datetime.utcnow()).total_seconds()
        return max(0, int(delta))

    @property
    def is_expired(self) -> bool:
        return datetime.utcnow() >= self.expiry_time

    @property
    def total_elapsed_minutes(self) -> float:
        return (datetime.utcnow() - self.created_at).total_seconds() / 60


# ─────────────────────────────────────────────────────────────
# SandboxManager — singleton
# ─────────────────────────────────────────────────────────────
class SandboxManager:
    """
    Central manager for all Docker-based lab sessions.
    Provides:
      - create_lab(session_id, challenge_id) → LabSession
      - remove_lab(session_id)
      - get_lab(session_id) → LabSession | None
      - extend_lab(session_id, minutes) → bool
      - cleanup_all()
      - is_available() → bool
      - start_cleanup_worker() / stop_cleanup_worker()
    """

    def __init__(self):
        self._client = None
        self._labs: dict[str, LabSession] = {}
        self._cleanup_task: Optional[asyncio.Task] = None

    # ── Docker client ──────────────────────────────────────────
    def _get_client(self):
        """
        Lazily initialise the Docker client.
        Automatically detects Docker Desktop (Linux) vs. system Docker with fallback.
        """
        if self._client is not None:
            return self._client

        import docker

        # Try from environment/active context first
        try:
            client = docker.from_env()
            client.ping()
            self._client = client
            return self._client
        except Exception as e:
            logger.info(f"docker.from_env() failed: {e}. Trying desktop socket.")

        # Fallback to Docker Desktop on Linux socket if it exists
        desktop_sock = os.path.expanduser("~/.docker/desktop/docker.sock")
        if os.path.exists(desktop_sock):
            try:
                client = docker.DockerClient(base_url=f"unix://{desktop_sock}")
                client.ping()
                self._client = client
                return self._client
            except Exception as e:
                logger.warning(f"Docker Desktop socket exists but is unresponsive: {e}")

        # Final fallback to standard socket/from_env
        self._client = docker.from_env()
        return self._client

    # Keep the old name for backwards-compat with terminal.py
    def _get_docker(self):
        return self._get_client()

    def is_available(self) -> bool:
        try:
            self._get_client().ping()
            return True
        except Exception as e:
            logger.warning(f"Docker not available: {e}")
            return False

    # ── Lab lifecycle ──────────────────────────────────────────
    def create_lab(self, session_id: str, challenge_id: str = "") -> Optional[LabSession]:
        """
        Spin up a full two-container lab:
          1. Create an isolated bridge network
          2. Start the target container (vulnerable server)
          3. Start the attackbox container, connected to the same network
        Returns a LabSession, or None on failure.
        """
        client = self._get_client()
        lab    = LabSession(session_id, challenge_id)
        sid = session_id[:8]

        try:
            # 1. Private network
            net_name = f"seclab-net-{sid}"
            lab.network = client.networks.create(
                net_name,
                driver="bridge",
                internal=True,          # no outbound internet from this network
                labels={LAB_LABEL: session_id},
            )
            logger.info(f"[{sid}] Network created: {net_name}")

            # 2. Target container
            target_name = f"seclab-target-{sid}"
            lab.target = client.containers.run(
                image=TARGET_IMAGE,
                name=target_name,
                hostname="target",
                environment={"CHALLENGE_ID": challenge_id},
                network=net_name,
                detach=True,
                stdin_open=False,
                tty=False,
                labels={LAB_LABEL: session_id, "seclab-role": "target"},
                **TARGET_LIMITS,
            )
            logger.info(f"[{sid}] Target started: {lab.target.short_id}")

            # 3. AttackBox container
            box_name = f"seclab-box-{sid}"
            lab.attackbox = client.containers.run(
                image=ATTACKBOX_IMAGE,
                name=box_name,
                hostname="attackbox",
                network=net_name,
                detach=True,
                stdin_open=True,
                tty=True,
                labels={LAB_LABEL: session_id, "seclab-role": "attackbox"},
                **ATTACKBOX_LIMITS,
            )
            logger.info(f"[{sid}] AttackBox started: {lab.attackbox.short_id}")

            # Verify attackbox is running
            import time
            time.sleep(0.5)
            lab.attackbox.reload()
            if lab.attackbox.status != "running":
                logs = lab.attackbox.logs().decode(errors="ignore")
                logger.error(f"[{sid}] AttackBox not running. Logs: {logs}")
                self._cleanup_lab_objects(lab)
                return None

            lab.status = "online"
            self._labs[session_id] = lab
            return lab

        except Exception as e:
            logger.error(f"[{sid}] Lab creation failed: {e}")
            self._cleanup_lab_objects(lab)
            return None

    def create_container(self, session_id: str, challenge_id: str = "") -> Optional[object]:
        """
        Backward-compat: creates a lab and returns the attackbox container.
        Used by the existing terminal.py without changes.
        """
        lab = self.create_lab(session_id, challenge_id)
        if lab is None:
            return None
        return lab.attackbox

    def get_lab(self, session_id: str) -> Optional[LabSession]:
        return self._labs.get(session_id)

    def get_lab_status(self, session_id: str) -> dict:
        """
        Returns a status dict for the given session:
          - status: "offline" | "spawning" | "online"
          - remaining_seconds: int
          - target_host: str
          - challenge_id: str
        """
        lab = self._labs.get(session_id)
        if not lab:
            return {
                "status": "offline",
                "remaining_seconds": 0,
                "target_host": "",
                "challenge_id": "",
            }

        # Refresh container status from Docker
        try:
            lab.attackbox.reload()
            if lab.attackbox.status != "running":
                lab.status = "offline"
        except Exception:
            lab.status = "offline"

        # Check expiry
        if lab.is_expired:
            lab.status = "offline"

        return {
            "status": lab.status,
            "remaining_seconds": lab.remaining_seconds,
            "target_host": "target:5000",
            "challenge_id": lab.challenge_id,
        }

    def extend_lab(self, session_id: str, minutes: int = 15) -> bool:
        """
        Extend the expiry time of a lab session.
        Returns True if extended successfully, False if session not found
        or if the extension would exceed the 3-hour hard cap.
        """
        lab = self._labs.get(session_id)
        if not lab:
            logger.warning(f"extend_lab: session {session_id[:8]} not found")
            return False

        # Calculate total session duration after extension
        new_expiry = lab.expiry_time + timedelta(minutes=minutes)
        total_duration = (new_expiry - lab.created_at).total_seconds() / 60

        if total_duration > MAX_SESSION_MINUTES:
            remaining_extendable = MAX_SESSION_MINUTES - (lab.expiry_time - lab.created_at).total_seconds() / 60
            if remaining_extendable <= 0:
                logger.warning(f"extend_lab: session {session_id[:8]} at max duration ({MAX_SESSION_MINUTES}m)")
                return False
            # Extend by whatever is left up to the cap
            lab.expiry_time = lab.created_at + timedelta(minutes=MAX_SESSION_MINUTES)
            logger.info(f"extend_lab: session {session_id[:8]} capped to max ({MAX_SESSION_MINUTES}m)")
        else:
            lab.expiry_time = new_expiry
            logger.info(f"extend_lab: session {session_id[:8]} extended by {minutes}m")

        return True

    def remove_lab(self, session_id: str):
        """Tear down all resources for a session."""
        lab = self._labs.pop(session_id, None)
        if lab:
            lab.status = "offline"
            self._cleanup_lab_objects(lab)
            logger.info(f"Lab removed: {session_id[:8]}")

    # Backward-compat alias
    def remove_container(self, session_id: str):
        self.remove_lab(session_id)

    def cleanup_all(self):
        """Remove every container/network bearing our label (called on shutdown)."""
        try:
            client = self._get_client()
            containers = client.containers.list(
                all=True, filters={"label": LAB_LABEL}
            )
            for c in containers:
                try:
                    c.stop(timeout=1)
                    c.remove(force=True)
                except Exception:
                    pass

            networks = client.networks.list(filters={"label": LAB_LABEL})
            for n in networks:
                try:
                    n.remove()
                except Exception:
                    pass

            self._labs.clear()
            logger.info(f"Cleaned up {len(containers)} containers, {len(networks)} networks")
        except Exception as e:
            logger.error(f"Cleanup error: {e}")

    # ── Async cleanup worker ──────────────────────────────────
    async def _cleanup_expired_loop(self):
        """Background coroutine that sweeps expired labs every CLEANUP_INTERVAL_SECS."""
        logger.info(f"Cleanup worker started (interval={CLEANUP_INTERVAL_SECS}s)")
        while True:
            try:
                await asyncio.sleep(CLEANUP_INTERVAL_SECS)
                expired_ids = [
                    sid for sid, lab in self._labs.items()
                    if lab.is_expired
                ]
                for sid in expired_ids:
                    logger.info(f"Auto-expiring lab session: {sid[:8]}")
                    self.remove_lab(sid)
            except asyncio.CancelledError:
                logger.info("Cleanup worker stopped")
                break
            except Exception as e:
                logger.error(f"Cleanup worker error: {e}")

    def start_cleanup_worker(self):
        """Start the background cleanup task (call from app startup event)."""
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._cleanup_expired_loop())
            logger.info("Cleanup worker task created")

    def stop_cleanup_worker(self):
        """Cancel the background cleanup task (call from app shutdown event)."""
        if self._cleanup_task and not self._cleanup_task.done():
            self._cleanup_task.cancel()

    # ── Private helpers ────────────────────────────────────────
    def _cleanup_lab_objects(self, lab: LabSession):
        """Best-effort cleanup of a partial or complete lab."""
        for container in (lab.attackbox, lab.target):
            if container:
                try:
                    container.stop(timeout=1)
                except Exception:
                    pass
                try:
                    container.remove(force=True)
                except Exception:
                    pass

        if lab.network:
            try:
                lab.network.remove()
            except Exception:
                pass


# Global singleton
sandbox_manager = SandboxManager()
