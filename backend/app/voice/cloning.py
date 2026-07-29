from __future__ import annotations

import re
import json
import subprocess
from pathlib import Path
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field


class VoiceSampleError(ValueError):
    pass


class SampleMetadata(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    path: str
    duration_sec: float = Field(alias="durationSec", gt=0)
    format: str
    size_bytes: int = Field(alias="sizeBytes", ge=0)


class CloneRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sample_path: str = Field(alias="samplePath", min_length=1)
    voice_id: str = Field(alias="voiceId", min_length=8, max_length=256)
    preview_text: str = Field(default="", alias="previewText", max_length=1000)
    model: str = Field(default="speech-2.8-hd", min_length=1)
    language_boost: str | None = Field(default="Chinese", alias="languageBoost")
    need_noise_reduction: bool = Field(
        default=False, alias="needNoiseReduction"
    )
    need_volume_normalization: bool = Field(
        default=False, alias="needVolumeNormalization"
    )


class CloneResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    voice_id: str = Field(alias="voiceId")
    status: Literal["ready", "failed"]
    demo_audio: str = Field(default="", alias="demoAudio")
    sample: SampleMetadata


class AudioProbe(Protocol):
    def probe(self, path: Path) -> SampleMetadata: ...


class VoiceCloneClient(Protocol):
    def upload_clone_sample(self, *, api_key: str, path: Path) -> int: ...

    def clone_voice(
        self, *, api_key: str, file_id: int, request: CloneRequest
    ) -> dict[str, object]: ...


VOICE_ID_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{6,254}[A-Za-z0-9]$")
SUPPORTED_SAMPLE_EXTENSIONS = {".mp3", ".m4a", ".wav"}
MAX_SAMPLE_BYTES = 20 * 1024 * 1024


class VoiceCloneService:
    def __init__(self, client: VoiceCloneClient, probe: AudioProbe) -> None:
        self.client = client
        self.probe = probe
        self.results: dict[str, CloneResult] = {}

    def validate_sample(self, path: Path) -> SampleMetadata:
        if not path.is_file():
            raise VoiceSampleError("声音样本文件不存在，请重新选择")
        if path.suffix.lower() not in SUPPORTED_SAMPLE_EXTENSIONS:
            raise VoiceSampleError("声音克隆仅支持 MP3、M4A 和 WAV 文件")
        if path.stat().st_size > MAX_SAMPLE_BYTES:
            raise VoiceSampleError("声音样本不能超过 20MB")
        metadata = self.probe.probe(path)
        if metadata.duration_sec < 10 or metadata.duration_sec > 300:
            raise VoiceSampleError("声音样本时长必须在 10 秒到 5 分钟之间")
        return metadata

    def clone(self, *, api_key: str, request: CloneRequest) -> CloneResult:
        if not VOICE_ID_PATTERN.fullmatch(request.voice_id):
            raise VoiceSampleError(
                "音色 ID 必须为 8–256 位，以英文字母开头，"
                "仅包含字母、数字、横线和下划线，且不能以横线或下划线结尾"
            )
        path = Path(request.sample_path)
        metadata = self.validate_sample(path)
        file_id = self.client.upload_clone_sample(api_key=api_key, path=path)
        response = self.client.clone_voice(
            api_key=api_key, file_id=file_id, request=request
        )
        result = CloneResult(
            voiceId=request.voice_id,
            status="ready",
            demoAudio=str(response.get("demo_audio") or ""),
            sample=metadata,
        )
        self.results[result.voice_id] = result
        return result

    def get(self, voice_id: str) -> CloneResult | None:
        return self.results.get(voice_id)


class FfprobeSampleProbe:
    def __init__(self, executable: str = "ffprobe") -> None:
        self.executable = executable

    def probe(self, path: Path) -> SampleMetadata:
        result = subprocess.run(
            [
                self.executable,
                "-v",
                "error",
                "-show_entries",
                "format=duration,format_name,size",
                "-of",
                "json",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        data = json.loads(result.stdout).get("format", {})
        return SampleMetadata(
            path=str(path),
            durationSec=float(data["duration"]),
            format=str(data.get("format_name") or path.suffix.removeprefix(".")),
            sizeBytes=int(data.get("size") or path.stat().st_size),
        )
