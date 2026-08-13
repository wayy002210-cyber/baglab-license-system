from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.license_proof import create_license_proof, verify_license_proof
from app.main import create_app
from app.media.asset_scanner import ScanResult


def test_license_proof_binds_build_device_and_expiry() -> None:
    now = datetime(2026, 8, 13, tzinfo=timezone.utc)
    proof = create_license_proof(
        secret="session-secret",
        build_id="0.7.0-test",
        device_fingerprint="device-a",
        expires_at=int(now.timestamp()) + 60,
    )

    claims = verify_license_proof(
        proof,
        secret="session-secret",
        expected_build_id="0.7.0-test",
        expected_device_fingerprint="device-a",
        now=now,
    )

    assert claims["buildId"] == "0.7.0-test"


@pytest.mark.parametrize("mutation", ["signature", "device", "build", "expired"])
def test_license_proof_rejects_invalid_or_copied_credentials(mutation: str) -> None:
    now = datetime(2026, 8, 13, tzinfo=timezone.utc)
    proof = create_license_proof(
        secret="session-secret",
        build_id="0.7.0-test",
        device_fingerprint="device-a",
        expires_at=int(now.timestamp()) + (60 if mutation != "expired" else -1),
    )
    if mutation == "signature":
        proof += "x"

    with pytest.raises(HTTPException) as error:
        verify_license_proof(
            proof,
            secret="wrong-secret" if mutation == "signature" else "session-secret",
            expected_build_id="other" if mutation == "build" else "0.7.0-test",
            expected_device_fingerprint="device-b" if mutation == "device" else "device-a",
            now=now,
        )

    assert error.value.status_code == 403


def test_protected_business_endpoint_requires_a_valid_license_proof() -> None:
    class Scanner:
        def scan(self, _root):
            return ScanResult(root_path=".", unsupported_count=0, assets=[])

    now = datetime.now(timezone.utc)
    app = create_app(
        session_token="local-token",
        license_proof_secret="proof-secret",
        license_device_fingerprint="device-a",
        asset_scanner=Scanner(),
    )
    client = __import__("fastapi.testclient", fromlist=["TestClient"]).TestClient(app)
    payload = {"folderPath": "."}

    missing = client.post("/assets/scan", headers={"X-Autocut-Token": "local-token"}, json=payload)
    proof = create_license_proof(
        secret="proof-secret",
        build_id=__import__("app.main", fromlist=["BACKEND_BUILD_ID"]).BACKEND_BUILD_ID,
        device_fingerprint="device-a",
        expires_at=int(now.timestamp()) + 60,
    )
    allowed = client.post(
        "/assets/scan",
        headers={"X-Autocut-Token": "local-token", "X-Autocut-License": proof},
        json=payload,
    )

    assert missing.status_code == 403
    assert allowed.status_code == 200
