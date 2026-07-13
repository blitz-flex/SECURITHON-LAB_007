import json

from app.core.config import settings
from app.services.arena.docker_verifier import verify_cwe89_docker
from app.services.arena.legacy_cwe import LegacyCweValidator


class FakeContainer:
    def __init__(self, output):
        self.output = output
        self.killed = False
        self.removed = False

    def wait(self, timeout):
        assert timeout >= 2
        return {"StatusCode": 0}

    def logs(self, stdout=True, stderr=True):
        return self.output

    def kill(self):
        self.killed = True

    def remove(self, force=True):
        self.removed = True


class FakeContainers:
    def __init__(self):
        self.kwargs = None
        self.container = FakeContainer(
            json.dumps(
                {
                    "success": True,
                    "message": "Defense Active! Parameterized query blocked the exploit payload.",
                }
            ).encode()
        )

    def run(self, **kwargs):
        self.kwargs = kwargs
        return self.container


class FakeDockerClient:
    def __init__(self):
        self.containers = FakeContainers()

    def ping(self):
        return True


class UnavailableDockerClient:
    containers = None

    def ping(self):
        raise RuntimeError("docker unavailable")


def test_docker_verifier_uses_hardened_container_options():
    client = FakeDockerClient()

    result = verify_cwe89_docker("def login(username, password): return True", client=client, image="verifier:test")

    assert result.success is True
    options = client.containers.kwargs
    assert options["image"] == "verifier:test"
    assert options["network_disabled"] is True
    assert options["read_only"] is True
    assert options["user"] == "65534:65534"
    assert options["cap_drop"] == ["ALL"]
    assert options["security_opt"] == ["no-new-privileges:true"]
    assert options["mem_limit"] == "128m"
    assert options["pids_limit"] == 32
    assert options["tmpfs"]["/tmp"].startswith("rw,noexec,nosuid")
    assert options["volumes"]
    assert client.containers.container.removed is True


def test_docker_verifier_unavailable_fails_closed():
    result = verify_cwe89_docker("def login(username, password): return True", client=UnavailableDockerClient())

    assert result.success is False
    assert "Docker verifier is unavailable" in result.message


def test_legacy_cwe89_uses_docker_backend_by_default(monkeypatch):
    calls = []

    def fake_docker_verify(code):
        calls.append(code)
        return type("SandboxResult", (), {"success": False, "message": "docker failure"})()

    monkeypatch.setattr("app.services.arena.docker_verifier.verify_cwe89_docker", fake_docker_verify)
    monkeypatch.setattr(settings, "ARENA_VERIFIER_BACKEND", "docker")
    monkeypatch.setattr(settings, "DEV_MODE", False)

    result = LegacyCweValidator()._verify_cwe89("submitted")

    assert calls == ["submitted"]
    assert result.success is False
    assert result.message == "docker failure"


def test_legacy_cwe89_allows_subprocess_only_in_dev_mode(monkeypatch):
    calls = []

    def fake_subprocess_verify(code):
        calls.append(code)
        return type("SandboxResult", (), {"success": True, "message": "dev fallback"})()

    monkeypatch.setattr("app.services.arena.python_sandbox.verify_cwe89", fake_subprocess_verify)
    monkeypatch.setattr(settings, "ARENA_VERIFIER_BACKEND", "subprocess")
    monkeypatch.setattr(settings, "DEV_MODE", True)

    result = LegacyCweValidator()._verify_cwe89("submitted")

    assert calls == ["submitted"]
    assert result.success is True
    assert result.message == "dev fallback"
