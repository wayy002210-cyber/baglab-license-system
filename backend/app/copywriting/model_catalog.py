from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal, Protocol

import httpx

from app.copywriting.bailian import (
    BailianAPIError,
    BailianAuthenticationError,
    ProviderModel,
)


@dataclass(frozen=True)
class ModelRecommendation:
    id: str
    display_name: str
    family: Literal["deepseek", "qwen", "other"]
    status: Literal["available"]
    note: str


@dataclass(frozen=True)
class ModelRefreshResult:
    recommendations: list[ModelRecommendation]
    checked_at: datetime
    source: Literal["provider", "fallback"]


class ModelChat(Protocol):
    def list_models(self, *, api_key: str) -> list[ProviderModel]: ...

    def complete(self, *, api_key: str, model: str, prompt: str) -> str: ...


RECOMMENDED_MODELS = (
    "deepseek-v4.1-flash",
    "qwen3.7-plus",
    "qwen3.8-flash",
    "deepseek-v4-pro",
    "qwen3.8-max",
)

DISPLAY_NAMES = {
    "deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
    "qwen3.7-plus": "Qwen 3.7 Plus",
    "qwen3.8-flash": "Qwen 3.8 Flash",
    "deepseek-v4-pro": "DeepSeek V4 Pro",
    "qwen3.8-max": "Qwen 3.8 Max",
}


class BailianModelCatalog:
    def __init__(self, *, chat: ModelChat) -> None:
        self.chat = chat

    def refresh(self, *, api_key: str) -> ModelRefreshResult:
        source: Literal["provider", "fallback"] = "provider"
        try:
            available_ids = {item.id for item in self.chat.list_models(api_key=api_key)}
            candidates = [item for item in RECOMMENDED_MODELS if item in available_ids]
        except BailianAuthenticationError:
            raise
        except BailianAPIError as error:
            if error.status_code in {401, 403, 429}:
                raise
            source = "fallback"
            candidates = list(RECOMMENDED_MODELS)
        except httpx.HTTPError:
            source = "fallback"
            candidates = list(RECOMMENDED_MODELS)

        recommendations: list[ModelRecommendation] = []
        network_failure_count = 0
        for model_id in candidates:
            try:
                self.chat.complete(
                    api_key=api_key,
                    model=model_id,
                    prompt='只返回 JSON：{"ok":true}',
                )
            except BailianAuthenticationError:
                raise
            except BailianAPIError as error:
                if error.status_code == 429:
                    raise
                continue
            except httpx.HTTPError:
                network_failure_count += 1
                continue
            except (RuntimeError, ValueError):
                continue
            recommendations.append(ModelRecommendation(
                id=model_id,
                display_name=DISPLAY_NAMES[model_id],
                family=(
                    "deepseek" if model_id.startswith("deepseek")
                    else "qwen" if model_id.startswith("qwen")
                    else "other"
                ),
                status="available",
                note=(
                    "实时调用验证通过（模型列表服务降级）"
                    if source == "fallback"
                    else "实时调用验证通过"
                ),
            ))
            if len(recommendations) == 5:
                break

        if not recommendations:
            if candidates and network_failure_count == len(candidates):
                raise BailianAPIError(
                    "百炼网络连接异常，请检查网络后重试",
                    code="BAILIAN_NETWORK_UNAVAILABLE",
                    status_code=503,
                )
            raise BailianAPIError(
                "当前账号没有可用的推荐文案模型",
                code="BAILIAN_NO_USABLE_MODEL",
                status_code=422,
            )
        return ModelRefreshResult(
            recommendations=recommendations,
            checked_at=datetime.now(timezone.utc),
            source=source,
        )
