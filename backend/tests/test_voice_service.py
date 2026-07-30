from pathlib import Path

from app.voice.service import MiniMaxRateLimitError, SynthesisRequest, VoiceService
from app.voice.minimax import MiniMaxTTS
import httpx
import pytest


class FakeMiniMax:
    def __init__(self) -> None:
        self.calls: list[tuple[str, SynthesisRequest]] = []
        self.failures = 0

    def list_voices(self, *, api_key: str):
        assert api_key == "minimax-secret"
        return [{"voice_id": "female-shaonv", "voice_name": "少女音"}]

    def synthesize(self, *, api_key: str, request: SynthesisRequest) -> bytes:
        self.calls.append((api_key, request))
        if self.failures:
            self.failures -= 1
            raise MiniMaxRateLimitError("rate limited")
        return b"fake-mp3"


def test_synthesis_is_cached_by_normalized_request(tmp_path: Path) -> None:
    client = FakeMiniMax()
    service = VoiceService(client, cache_dir=tmp_path)
    request = SynthesisRequest(text="  欢迎了解我们的工厂  ", voiceId="female-shaonv")

    first = service.synthesize(api_key="minimax-secret", request=request)
    second = service.synthesize(api_key="minimax-secret", request=request)

    assert first.cache_hit is False
    assert second.cache_hit is True
    assert first.audio_path == second.audio_path
    assert Path(first.audio_path).read_bytes() == b"fake-mp3"
    assert len(client.calls) == 1


def test_synthesis_retries_rate_limits_with_exponential_backoff(
    tmp_path: Path,
) -> None:
    client = FakeMiniMax()
    client.failures = 2
    sleeps: list[float] = []
    service = VoiceService(client, cache_dir=tmp_path, sleep=sleeps.append)

    result = service.synthesize(
        api_key="minimax-secret",
        request=SynthesisRequest(text="测试限流", voiceId="female-shaonv"),
    )

    assert Path(result.audio_path).exists()
    assert sleeps == [1.0, 2.0]
    assert len(client.calls) == 3


def test_cache_key_changes_when_voice_parameters_change(tmp_path: Path) -> None:
    client = FakeMiniMax()
    service = VoiceService(client, cache_dir=tmp_path)

    one = service.synthesize(
        api_key="minimax-secret",
        request=SynthesisRequest(text="同一句话", voiceId="voice-a"),
    )
    two = service.synthesize(
        api_key="minimax-secret",
        request=SynthesisRequest(text="同一句话", voiceId="voice-b"),
    )

    assert one.audio_path != two.audio_path
    assert len(client.calls) == 2


def test_minimax_client_decodes_hex_audio_and_maps_request(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def post(url, *, headers, json, timeout):
        captured.update(url=url, headers=headers, json=json, timeout=timeout)
        return httpx.Response(
            200,
            json={"data": {"audio": b"mp3-data".hex()}},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", post)
    audio = MiniMaxTTS().synthesize(
        api_key="secret",
        request=SynthesisRequest(
            text="你好", voiceId="voice-1", speed=1.2, volume=0.8, pitch=2,
            emotion="happy"
        ),
    )

    assert audio == b"mp3-data"
    assert captured["url"] == "https://api.minimaxi.com/v1/t2a_v2"
    payload = captured["json"]
    assert payload["voice_setting"] == {
        "voice_id": "voice-1",
        "speed": 1.2,
        "vol": 0.8,
        "pitch": 2,
        "emotion": "happy",
    }


def test_minimax_client_converts_http_429_to_retryable_error(monkeypatch) -> None:
    def post(url, **kwargs):
        return httpx.Response(429, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", post)

    with pytest.raises(MiniMaxRateLimitError):
        MiniMaxTTS().synthesize(
            api_key="secret",
            request=SynthesisRequest(text="你好", voiceId="voice-1"),
        )
def test_minimax_client_lists_all_voices_with_the_current_post_contract(
    monkeypatch,
) -> None:
    captured: dict[str, object] = {}

    def post(url, *, headers, json, timeout):
        captured.update(url=url, headers=headers, json=json, timeout=timeout)
        return httpx.Response(
            200,
            json={
                "system_voice": [{"voice_id": "voice-1"}],
                "voice_cloning": [{"voice_id": "clone-1"}],
                "base_resp": {"status_code": 0, "status_msg": "success"},
            },
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", post)
    voices = MiniMaxTTS().list_voices(api_key="secret")

    assert [voice["voice_id"] for voice in voices] == ["voice-1", "clone-1"]
    assert captured["url"] == "https://api.minimaxi.com/v1/get_voice"
    assert captured["json"] == {"voice_type": "all"}
