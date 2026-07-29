from pathlib import Path

import httpx
import pytest

from app.voice.cloning import (
    CloneRequest,
    SampleMetadata,
    VoiceCloneService,
    VoiceSampleError,
)
from app.voice.minimax import MiniMaxVoiceClient


class Probe:
    def __init__(self, duration: float = 15.0) -> None:
        self.duration = duration

    def probe(self, path: Path) -> SampleMetadata:
        return SampleMetadata(
            path=str(path),
            durationSec=self.duration,
            format=path.suffix.removeprefix("."),
            sizeBytes=path.stat().st_size,
        )


class Client:
    def upload_clone_sample(self, *, api_key: str, path: Path) -> int:
        assert api_key == "secret"
        assert path.name == "sample.mp3"
        return 123

    def clone_voice(self, *, api_key: str, file_id: int, request: CloneRequest):
        assert api_key == "secret"
        assert file_id == 123
        return {"demo_audio": "https://example.com/preview.mp3"}


def test_clone_validates_uploads_and_returns_ready_voice(tmp_path: Path) -> None:
    sample = tmp_path / "sample.mp3"
    sample.write_bytes(b"audio")
    service = VoiceCloneService(Client(), Probe())

    result = service.clone(
        api_key="secret",
        request=CloneRequest(
            samplePath=str(sample),
            voiceId="BagLabVoice01",
            previewText="欢迎了解袋研官",
            model="speech-2.8-hd",
        ),
    )

    assert result.status == "ready"
    assert result.voice_id == "BagLabVoice01"
    assert result.demo_audio == "https://example.com/preview.mp3"


@pytest.mark.parametrize(
    ("name", "duration"),
    [("sample.flac", 15.0), ("sample.mp3", 9.9), ("sample.wav", 301.0)],
)
def test_clone_rejects_invalid_sample_format_or_duration(
    tmp_path: Path, name: str, duration: float
) -> None:
    sample = tmp_path / name
    sample.write_bytes(b"audio")
    service = VoiceCloneService(Client(), Probe(duration))

    with pytest.raises(VoiceSampleError):
        service.validate_sample(sample)


def test_minimax_voice_client_uses_official_upload_and_clone_contract(
    tmp_path: Path, monkeypatch
) -> None:
    sample = tmp_path / "sample.mp3"
    sample.write_bytes(b"audio")
    calls: list[dict] = []

    def post(url, **kwargs):
        calls.append({"url": url, **kwargs})
        if url.endswith("/files/upload"):
            return httpx.Response(
                200,
                json={"file": {"file_id": 123}, "base_resp": {"status_code": 0}},
                request=httpx.Request("POST", url),
            )
        return httpx.Response(
            200,
            json={
                "demo_audio": "https://example.com/demo.mp3",
                "base_resp": {"status_code": 0},
            },
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", post)
    client = MiniMaxVoiceClient()
    file_id = client.upload_clone_sample(api_key="secret", path=sample)
    result = client.clone_voice(
        api_key="secret",
        file_id=file_id,
        request=CloneRequest(
            samplePath=str(sample),
            voiceId="BagLabVoice01",
            previewText="试听",
            model="speech-2.8-hd",
            needNoiseReduction=True,
            needVolumeNormalization=True,
        ),
    )

    assert calls[0]["data"] == {"purpose": "voice_clone"}
    assert calls[1]["json"]["voice_id"] == "BagLabVoice01"
    assert calls[1]["json"]["need_noise_reduction"] is True
    assert result["demo_audio"].endswith("demo.mp3")
