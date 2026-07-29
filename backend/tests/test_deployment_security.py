import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_deployment_files_require_secrets_and_immutable_builds():
    env_example = (ROOT / "backend" / ".env.example").read_text(encoding="utf-8")
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    zeabur = json.loads((ROOT / "zeabur.json").read_text(encoding="utf-8"))
    workflow = (ROOT / ".github" / "workflows" / "deploy.yml").read_text(encoding="utf-8")

    assert "DASHBOARD_PASS=" not in env_example
    assert "DASHBOARD_PASSWORD_HASH=" in env_example
    assert "DASHBOARD_SESSION_SECRET=" in env_example
    assert "N8N_MAP_API_KEY=" in env_example
    assert "DASHBOARD_PASSWORD_HASH=admin" not in env_example
    assert "requirements.lock" in dockerfile
    assert "--require-hashes" in dockerfile
    assert "node:22-alpine" in dockerfile
    assert "org.opencontainers.image.revision" in dockerfile
    assert "VITE_MAPBOX_TOKEN" in dockerfile
    assert "pk.*" in dockerfile
    assert "Configure GitHub Actions repository variable VITE_MAPBOX_TOKEN" in dockerfile

    service = zeabur["spec"]["services"][0]
    image = service["spec"]["source"]["image"]
    env = service["spec"]["env"]
    assert image.endswith(":REPLACE_WITH_GIT_SHA")
    for name in (
        "PUBLIC_APP_ORIGIN",
        "ALLOWED_HOSTS",
        "DASHBOARD_USER",
        "DASHBOARD_PASSWORD_HASH",
        "DASHBOARD_SESSION_SECRET",
        "DASHBOARD_SESSION_TTL_SECONDS",
        "SESSION_COOKIE_SECURE",
        "N8N_API_KEY",
        "N8N_MAP_API_KEY",
    ):
        assert name in env
    assert env["DASHBOARD_PASSWORD_HASH"]["default"] == ""
    assert env["DASHBOARD_SESSION_SECRET"]["default"] == ""

    assert "pip_audit" in workflow
    assert "npm run audit:production" in workflow
    audit_policy = (
        ROOT / "frontend" / "scripts" / "audit-production.mjs"
    ).read_text(encoding="utf-8")
    assert "GHSA-qwww-vcr4-c8h2" in audit_policy
    assert "unstable RSC APIs" in audit_policy
    assert "high" in audit_policy
    assert "critical" in audit_policy
    assert "github.sha" in workflow
    assert "Validate public Mapbox build token" in workflow
    assert "vars.VITE_MAPBOX_TOKEN" in workflow
    assert "Configure GitHub Actions repository variable VITE_MAPBOX_TOKEN" in workflow


def test_hashed_dev_lock_includes_bootstrap_dependencies():
    lockfile = (ROOT / "backend" / "requirements-dev.lock").read_text(encoding="utf-8")

    for package in ("pip", "setuptools"):
        assert re.search(
            rf"^{package}==[^\s\\]+ \\\n\s+--hash=sha256:",
            lockfile,
            flags=re.MULTILINE,
        ), f"{package} must be pinned and hashed for --require-hashes installs"


def test_hashed_dev_lock_includes_linux_standard_server_dependency():
    lockfile = (ROOT / "backend" / "requirements-dev.lock").read_text(encoding="utf-8")

    assert re.search(
        r"^uvloop==[^\s\\]+ ; .*sys_platform != 'win32'.* \\\n\s+--hash=sha256:",
        lockfile,
        flags=re.MULTILINE,
    ), "uvloop must be pinned and hashed for Linux uvicorn[standard] installs"


def test_ghcr_image_owner_is_normalized_to_lowercase():
    workflow = (ROOT / ".github" / "workflows" / "deploy.yml").read_text(encoding="utf-8")

    assert "tags: ghcr.io/${{ github.repository_owner }}" not in workflow
    assert "GITHUB_REPOSITORY_OWNER,," in workflow
    assert "steps.image.outputs.name" in workflow
