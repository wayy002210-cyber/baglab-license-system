from __future__ import annotations

import httpx
import pytest

from app.copywriting.bailian import (
    BailianAPIError,
    BailianAuthenticationError,
    ProviderModel,
)
from app.copywriting.model_catalog import BailianModelCatalog


class FakeChat:
    def __init__(
        self,
        *,
        listed: list[str] | None = None,
        list_error: Exception | None = None,
        failed_probes: set[str] | None = None,
        probe_error: Exception | None = None,
    ) -> None:
        self.listed = listed or []
        self.list_error = list_error
        self.failed_probes = failed_probes or set()
        self.probe_error = probe_error
        self.probed: list[str] = []

    def list_models(self, *, api_key: str) -> list[ProviderModel]:
        if self.list_error:
            raise self.list_error
        return [ProviderModel(id=item) for item in self.listed]

    def complete(self, *, api_key: str, model: str, prompt: str) -> str:
        self.probed.append(model)
        if self.probe_error:
            raise self.probe_error
        if model in self.failed_probes:
            raise BailianAPIError(
                "forbidden", code="BAILIAN_MODEL_FORBIDDEN", status_code=403
            )
        return '{"ok":true}'


def test_refresh_ranks_probes_and_limits_to_five() -> None:
    chat = FakeChat(listed=[
        "qwen3.8-max",
        "deepseek-v4-pro",
        "qwen3.8-flash",
        "qwen3.7-plus",
        "deepseek-v4.1-flash",
        "unrelated-model",
    ])

    result = BailianModelCatalog(chat=chat).refresh(api_key="secret")

    assert [item.id for item in result.recommendations] == [
        "deepseek-v4.1-flash",
        "qwen3.7-plus",
        "qwen3.8-flash",
        "deepseek-v4-pro",
        "qwen3.8-max",
    ]
    assert all(item.status == "available" for item in result.recommendations)
    assert result.source == "provider"


def test_refresh_uses_verified_fallback_when_listing_is_unavailable() -> None:
    chat = FakeChat(list_error=httpx.ConnectTimeout("timeout"))

    result = BailianModelCatalog(chat=chat).refresh(api_key="secret")

    assert result.source == "fallback"
    assert len(result.recommendations) == 5
    assert chat.probed[0] == "deepseek-v4.1-flash"


def test_refresh_excludes_failed_probes() -> None:
    chat = FakeChat(
        listed=["deepseek-v4.1-flash", "qwen3.7-plus"],
        failed_probes={"deepseek-v4.1-flash"},
    )

    result = BailianModelCatalog(chat=chat).refresh(api_key="secret")

    assert [item.id for item in result.recommendations] == ["qwen3.7-plus"]


def test_refresh_preserves_authentication_failure() -> None:
    chat = FakeChat(list_error=BailianAuthenticationError(
        "invalid", code="BAILIAN_INVALID_KEY", status_code=401
    ))

    with pytest.raises(BailianAuthenticationError):
        BailianModelCatalog(chat=chat).refresh(api_key="secret")


def test_refresh_raises_when_no_candidate_is_usable() -> None:
    chat = FakeChat(
        listed=["deepseek-v4.1-flash"],
        failed_probes={"deepseek-v4.1-flash"},
    )

    with pytest.raises(BailianAPIError) as captured:
        BailianModelCatalog(chat=chat).refresh(api_key="secret")

    assert captured.value.code == "BAILIAN_NO_USABLE_MODEL"
    assert captured.value.status_code == 422


def test_refresh_reports_network_failure_when_catalog_and_all_probes_timeout() -> None:
    chat = FakeChat(
        list_error=httpx.ConnectTimeout("catalog timeout"),
        probe_error=httpx.ConnectTimeout("probe timeout"),
    )

    with pytest.raises(BailianAPIError) as captured:
        BailianModelCatalog(chat=chat).refresh(api_key="secret")

    assert captured.value.code == "BAILIAN_NETWORK_UNAVAILABLE"
    assert captured.value.status_code == 503
