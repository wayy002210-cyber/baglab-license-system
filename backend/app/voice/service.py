from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Callable, Protocol

from pydantic import BaseModel, ConfigDict, Field, field_validator


class MiniMaxRateLimitError(RuntimeError):
    """Raised when MiniMax asks the client to retry later."""


def voice_error_message(error: Exception) -> str:
    """Convert provider failures into an actionable Chinese message."""
    status_code = getattr(error, "status_code", None)
    message = str(error).strip()
    normalized = message.lower()
    if status_code == 1008 or any(
        word in normalized for word in ("insufficient balance", "余额不足", "欠费")
    ):
        return "MiniMax 余额不足，请充值后重新生成"
    if status_code in (401, 403, 1004) or any(
        word in normalized for word in ("invalid api key", "unauthorized")
    ):
        return "MiniMax API Key 无效或当前音色/模型没有权限，请到系统设置检查"
    if isinstance(error, MiniMaxRateLimitError) or "rate limit" in normalized or "rpm" in normalized:
        return "MiniMax 每分钟请求次数已达上限，系统重试后仍未恢复；请稍后再试或提升 MiniMax RPM 配额"
    if "timeout" in normalized or "timed out" in normalized:
        return "连接 MiniMax 超时，请检查网络后重试"
    if "voice" in normalized and any(word in normalized for word in ("not found", "invalid")):
        return "MiniMax 音色不存在或已失效，请在音频设置中重新选择音色"
    return f"MiniMax 配音生成失败：{message or '未知错误'}"


class SynthesisRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    text: str = Field(min_length=1, max_length=10_000)
    voice_id: str = Field(alias="voiceId", min_length=1)
    model: str = Field(default="speech-2.6-hd", min_length=1)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    volume: float = Field(default=1.0, ge=0.0, le=3.0)
    pitch: int = Field(default=0, ge=-12, le=12)
    emotion: str | None = None
    language_boost: str | None = Field(default="Chinese", alias="languageBoost")

    @field_validator("text")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("text must not be blank")
        return normalized


class SynthesisResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    audio_path: str = Field(alias="audioPath")
    cache_hit: bool = Field(alias="cacheHit")
    sha256: str
    duration_sec: float = Field(alias="durationSec", gt=0)


class MiniMaxClient(Protocol):
    def list_voices(self, *, api_key: str) -> list[dict[str, object]]: ...

    def synthesize(self, *, api_key: str, request: SynthesisRequest) -> bytes: ...


class VoiceService:
    def __init__(
        self,
        client: MiniMaxClient,
        *,
        cache_dir: Path,
        sleep: Callable[[float], None] = time.sleep,
        max_attempts: int = 5,
        duration_probe: Callable[[Path], float] | None = None,
    ) -> None:
        self.client = client
        self.cache_dir = cache_dir
        self.sleep = sleep
        self.max_attempts = max_attempts
        self.duration_probe = duration_probe or (lambda _path: 1.0)

    def list_voices(self, *, api_key: str) -> list[dict[str, str]]:
        voices = self.client.list_voices(api_key=api_key)
        return [
            {
                "voiceId": str(voice.get("voice_id") or voice.get("voiceId") or ""),
                "name": str(
                    voice.get("voice_name")
                    or voice.get("name")
                    or voice.get("voice_id")
                    or ""
                ),
                "kind": str(voice.get("kind") or "system"),
            }
            for voice in voices
            if voice.get("voice_id") or voice.get("voiceId")
        ]

    def synthesize(
        self, *, api_key: str, request: SynthesisRequest
    ) -> SynthesisResult:
        cache_key = self._cache_key(request)
        output = self.cache_dir / f"{cache_key}.mp3"
        if output.is_file() and output.stat().st_size > 0:
            return SynthesisResult(
                audioPath=str(output),
                cacheHit=True,
                sha256=cache_key,
                durationSec=self.duration_probe(output),
            )

        audio = self._synthesize_with_retry(api_key=api_key, request=request)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        temporary = output.with_suffix(f".{os.getpid()}.tmp")
        temporary.write_bytes(audio)
        temporary.replace(output)
        return SynthesisResult(
            audioPath=str(output),
            cacheHit=False,
            sha256=cache_key,
            durationSec=self.duration_probe(output),
        )

    def _synthesize_with_retry(
        self, *, api_key: str, request: SynthesisRequest
    ) -> bytes:
        for attempt in range(self.max_attempts):
            try:
                return self.client.synthesize(api_key=api_key, request=request)
            except MiniMaxRateLimitError:
                if attempt + 1 >= self.max_attempts:
                    raise
                self.sleep(float(5 * 2**attempt))
        raise RuntimeError("MiniMax synthesis failed")

    @staticmethod
    def _cache_key(request: SynthesisRequest) -> str:
        payload = request.model_dump(mode="json", by_alias=True)
        canonical = json.dumps(
            payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
