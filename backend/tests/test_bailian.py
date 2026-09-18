from __future__ import annotations

import httpx
import pytest

from app.copywriting.bailian import (
    BailianAPIError,
    BailianAuthenticationError,
    BailianChat,
    ProviderModel,
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


def test_deepseek_v4_disables_thinking_for_json_output(monkeypatch) -> None:
    captured: dict = {}

    def fake_post(*args, **kwargs):
        captured.update(kwargs["json"])
        return response(
            200,
            {"choices": [{"message": {"content": '{"topics":[]}'}}]},
        )

    monkeypatch.setattr(httpx, "post", fake_post)

    BailianChat().complete(
        api_key="secret", model="deepseek-v4.1-flash", prompt="hello"
    )

    assert captured["response_format"] == {"type": "json_object"}
    assert captured["enable_thinking"] is False


def test_list_models_returns_provider_model_ids(monkeypatch) -> None:
    captured: dict = {}

    def fake_get(url, **kwargs):
        captured["url"] = url
        captured["headers"] = kwargs["headers"]
        return httpx.Response(
            200,
            json={"output": {"models": [
                {"model_name": "deepseek-v4.1-flash"},
                {"id": "qwen3.7-plus"},
            ]}},
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(httpx, "get", fake_get)

    result = BailianChat().list_models(api_key="secret")

    assert captured["url"] == BailianChat.models_endpoint
    assert captured["headers"]["Authorization"] == "Bearer secret"
    assert result == [
        ProviderModel(id="deepseek-v4.1-flash"),
        ProviderModel(id="qwen3.7-plus"),
    ]


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


def test_qwen3_disables_thinking_for_json_output(monkeypatch) -> None:
    captured: dict = {}

    def fake_post(*args, **kwargs):
        captured.update(kwargs["json"])
        return response(
            200,
            {"choices": [{"message": {"content": '{"topics":[]}'}}]},
        )

    monkeypatch.setattr(httpx, "post", fake_post)

    BailianChat().complete(
        api_key="secret", model="qwen3.8-flash", prompt="hello"
    )

    assert captured["enable_thinking"] is False


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


def test_embed_batches_texts_and_preserves_provider_index_order(monkeypatch) -> None:
    captured: dict = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs["json"])
        request = httpx.Request("POST", url)
        return httpx.Response(200, json={
            "data": [
                {"index": 1, "embedding": [0.0, 1.0]},
                {"index": 0, "embedding": [1.0, 0.0]},
            ]
        }, request=request)

    monkeypatch.setattr(httpx, "post", fake_post)

    vectors = BailianChat().embed(
        api_key="secret", texts=["甲", "乙"], dimensions=2
    )

    assert captured["url"] == BailianChat.embedding_endpoint
    assert captured["model"] == "text-embedding-v3"
    assert captured["input"] == ["甲", "乙"]
    assert vectors == [[1.0, 0.0], [0.0, 1.0]]


def test_embed_rejects_malformed_vectors_with_stable_error(monkeypatch) -> None:
    def fake_post(url, **kwargs):
        return httpx.Response(
            200,
            json={"data": [{"index": 0, "embedding": [1.0, float("nan")]}]},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", fake_post)

    with pytest.raises(BailianAPIError) as captured:
        BailianChat().embed(api_key="secret", texts=["甲"], dimensions=2)

    assert captured.value.code == "BAILIAN_EMBEDDING_UNAVAILABLE"


def test_search_returns_content_and_real_provider_sources(monkeypatch) -> None:
    captured: dict = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs["json"])
        return httpx.Response(200, json={
            "output": {
                "text": '{"hotspots":[]}',
                "search_info": {
                    "search_results": [{
                        "title": "行业新规",
                        "url": "https://example.com/news",
                        "site_name": "示例来源",
                        "published_at": "2026-09-15",
                    }]
                },
            }
        }, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", fake_post)

    result = BailianChat().search(
        api_key="secret", model="qwen-plus", prompt="近期帆布袋行业信息"
    )

    assert captured["url"] == BailianChat.search_endpoint
    assert captured["parameters"]["enable_search"] is True
    assert captured["parameters"]["search_options"]["forced_search"] is True
    assert result.content == '{"hotspots":[]}'
    assert result.sources[0].url == "https://example.com/news"
    assert result.sources[0].published_at == "2026-09-15"
