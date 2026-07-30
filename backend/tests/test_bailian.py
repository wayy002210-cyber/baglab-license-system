from __future__ import annotations

import httpx
import pytest

from app.copywriting.bailian import (
    BailianAuthenticationError,
    BailianChat,
)


def response(status: int, payload: dict) -> httpx.Response:
    request = httpx.Request("POST", BailianChat.endpoint)
    return httpx.Response(status, json=payload, request=request)


def test_deepseek_requests_json_object_output(monkeypatch) -> None:
    captured: dict = {}

    def fake_post(*args, **kwargs):
        captured.update(kwargs["json"])
        return response(
            200,
            {"choices": [{"message": {"content": '{"topics":[]}'}}]},
        )

    monkeypatch.setattr(httpx, "post", fake_post)

    BailianChat().complete(
        api_key="secret", model="deepseek-v3", prompt="hello"
    )

    assert captured["response_format"] == {"type": "json_object"}


def test_qwen_can_request_json_object_output(monkeypatch) -> None:
    captured: dict = {}

    def fake_post(*args, **kwargs):
        captured.update(kwargs["json"])
        return response(
            200,
            {"choices": [{"message": {"content": '{"topics":[]}'}}]},
        )

    monkeypatch.setattr(httpx, "post", fake_post)

    BailianChat().complete(
        api_key="secret", model="qwen-plus", prompt="hello"
    )

    assert captured["response_format"] == {"type": "json_object"}


def test_invalid_key_has_typed_error_without_echoing_secret(monkeypatch) -> None:
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *args, **kwargs: response(
            401,
            {"error": {"code": "invalid_api_key", "message": "Incorrect API key"}},
        ),
    )

    with pytest.raises(BailianAuthenticationError) as captured:
        BailianChat().complete(
            api_key="do-not-log-this", model="deepseek-v3", prompt="hello"
        )

    assert "do-not-log-this" not in str(captured.value)
    assert captured.value.code == "BAILIAN_INVALID_KEY"
