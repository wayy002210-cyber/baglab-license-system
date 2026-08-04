import httpx
import pytest

from app.voice.minimax import MiniMaxTTS
from app.voice.service import (
    MiniMaxRateLimitError,
    SynthesisRequest,
    voice_error_message,
)


class ProviderError(RuntimeError):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code


def test_voice_error_message_explains_balance_and_next_action() -> None:
    assert voice_error_message(ProviderError(1008, "insufficient balance")) == (
        "MiniMax 余额不足，请充值后重新生成"
    )


def test_voice_error_message_explains_rpm_limit_and_next_action() -> None:
    assert voice_error_message(RuntimeError("rate limit exceeded(RPM)")) == (
        "MiniMax 每分钟请求次数已达上限，系统重试后仍未恢复；请稍后再试或提升 MiniMax RPM 配额"
    )


def test_voice_error_message_explains_invalid_key() -> None:
    assert voice_error_message(ProviderError(1004, "invalid api key")) == (
        "MiniMax API Key 无效或当前音色/模型没有权限，请到系统设置检查"
    )


def test_minimax_client_converts_provider_rpm_error_to_retryable_error(monkeypatch) -> None:
    def post(url, **kwargs):
        return httpx.Response(
            200,
            json={"base_resp": {"status_code": 1002, "status_msg": "rate limit exceeded(RPM)"}},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", post)

    with pytest.raises(MiniMaxRateLimitError):
        MiniMaxTTS().synthesize(
            api_key="secret",
            request=SynthesisRequest(text="测试限流", voiceId="voice-1"),
        )
