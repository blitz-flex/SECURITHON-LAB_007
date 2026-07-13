from __future__ import annotations

import json
import tempfile
from pathlib import Path

from app.core.config import settings
from app.services.arena.python_sandbox import CWE89_HARNESS, MAX_OUTPUT_CHARS, SANDBOX_TIMEOUT_SECONDS, SandboxResult


DOCKER_TIMEOUT_SECONDS = SANDBOX_TIMEOUT_SECONDS + 1
CONTAINER_USER = "65534:65534"


def _runner_source() -> str:
    return CWE89_HARNESS.replace(
        "json.loads(sys.stdin.read())",
        "json.loads(open('/runner/payload.json', encoding='utf-8').read())",
    )


def _parse_output(output: bytes | str) -> SandboxResult:
    text = output.decode("utf-8", errors="replace") if isinstance(output, bytes) else output
    text = (text or "")[:MAX_OUTPUT_CHARS]
    try:
        payload = json.loads(text.strip().splitlines()[-1])
        return SandboxResult(bool(payload["success"]), str(payload["message"]))
    except (IndexError, KeyError, json.JSONDecodeError, TypeError):
        return SandboxResult(False, "Runtime Error during verification: sandbox returned invalid output.")


def verify_cwe89_docker(code: str, *, client=None, image: str | None = None) -> SandboxResult:
    """Run CWE-89 verification in a locked-down disposable Docker container."""
    try:
        import docker
    except Exception:
        return SandboxResult(False, "Runtime Error during verification: Docker verifier is unavailable.")

    image = image or settings.ARENA_VERIFIER_IMAGE
    try:
        docker_client = client or docker.from_env()
        docker_client.ping()
    except Exception:
        return SandboxResult(False, "Runtime Error during verification: Docker verifier is unavailable.")

    with tempfile.TemporaryDirectory(prefix="arena-docker-verify-") as tmpdir:
        runner_dir = Path(tmpdir)
        (runner_dir / "verify.py").write_text(_runner_source(), encoding="utf-8")
        (runner_dir / "payload.json").write_text(json.dumps({"code": code}), encoding="utf-8")

        container = None
        try:
            container = docker_client.containers.run(
                image=image,
                command=["python", "-I", "/runner/verify.py"],
                detach=True,
                remove=False,
                stdout=True,
                stderr=True,
                network_disabled=True,
                read_only=True,
                user=CONTAINER_USER,
                working_dir="/runner",
                environment={"PYTHONIOENCODING": "utf-8"},
                volumes={str(runner_dir): {"bind": "/runner", "mode": "ro"}},
                tmpfs={"/tmp": "rw,noexec,nosuid,size=16m"},
                mem_limit="128m",
                nano_cpus=500_000_000,
                pids_limit=32,
                cap_drop=["ALL"],
                security_opt=["no-new-privileges:true"],
                labels={"seclab-managed": "arena-verifier", "seclab-role": "verifier"},
            )
            container.wait(timeout=DOCKER_TIMEOUT_SECONDS)
            output = container.logs(stdout=True, stderr=True)
        except Exception as exc:
            message = str(exc).lower()
            if "timeout" in message or "timed out" in message:
                if container is not None:
                    try:
                        container.kill()
                    except Exception:
                        pass
                return SandboxResult(False, "Runtime Error during verification: execution timed out.")
            return SandboxResult(False, "Runtime Error during verification: Docker sandbox failed.")
        finally:
            if container is not None:
                try:
                    container.remove(force=True)
                except Exception:
                    pass

    return _parse_output(output)
