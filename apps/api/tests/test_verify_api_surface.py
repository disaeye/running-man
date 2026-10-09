from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from sys import modules

import pytest
from fastapi import FastAPI

from main import app

SCRIPT_PATH = Path(__file__).parents[3] / "scripts" / "verify_api_surface.py"
SCRIPT_SPEC = spec_from_file_location("verify_api_surface", SCRIPT_PATH)
assert SCRIPT_SPEC is not None and SCRIPT_SPEC.loader is not None
surface_verifier = module_from_spec(SCRIPT_SPEC)
modules[SCRIPT_SPEC.name] = surface_verifier
SCRIPT_SPEC.loader.exec_module(surface_verifier)


@pytest.mark.no_db
async def test_version_one_surface_and_legacy_paths() -> None:
    report = await surface_verifier.verify(
        app,
        ("/api/pmc", "/auth/login", "/webhooks/v2/intervals"),
    )

    assert report["ok"] is True
    assert [result["status_code"] for result in report["negative_paths"]] == [404, 404, 404]
    assert [result["version"] for result in report["negative_paths"]] == ["1", "1", "1"]


@pytest.mark.no_db
async def test_rejects_unversioned_openapi_path() -> None:
    legacy_app = FastAPI(version="1.0.0")

    @legacy_app.get("/api/pmc")
    async def legacy_pmc() -> dict[str, str]:
        return {"status": "wrong"}

    report = await surface_verifier.verify(legacy_app, ("/api/pmc",))

    assert report["ok"] is False
    assert "unexpected public path: /api/pmc" in report["diagnostics"]
    assert "negative path /api/pmc returned 200, expected 404" in report["diagnostics"]
