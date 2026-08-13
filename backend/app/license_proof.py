from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone

from fastapi import HTTPException


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_license_proof(
    *, secret: str, build_id: str, device_fingerprint: str, expires_at: int
) -> str:
    payload = _encode(
        json.dumps(
            {
                "buildId": build_id,
                "deviceFingerprint": device_fingerprint,
                "expiresAt": expires_at,
            },
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    )
    signature = _encode(
        hmac.new(secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest()
    )
    return f"{payload}.{signature}"


def verify_license_proof(
    proof: str | None,
    *,
    secret: str,
    expected_build_id: str,
    expected_device_fingerprint: str,
    now: datetime | None = None,
) -> dict[str, object]:
    try:
        payload, supplied_signature = (proof or "").split(".", 1)
        expected_signature = _encode(
            hmac.new(
                secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256
            ).digest()
        )
        if not hmac.compare_digest(supplied_signature, expected_signature):
            raise ValueError("signature")
        claims = json.loads(_decode(payload))
        current = int((now or datetime.now(timezone.utc)).timestamp())
        if claims.get("buildId") != expected_build_id:
            raise ValueError("build")
        if claims.get("deviceFingerprint") != expected_device_fingerprint:
            raise ValueError("device")
        if not isinstance(claims.get("expiresAt"), int) or claims["expiresAt"] < current:
            raise ValueError("expired")
        return claims
    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=403,
            detail={"code": "LICENSE_PROOF_INVALID", "message": "授权证明无效或已过期"},
        ) from error
