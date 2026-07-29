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
        max_attempts: int = 3,
    ) -> None:
        self.client = client
        self.cache_dir = cache_dir
        self.sleep = sleep
        self.max_attempts = max_attempts

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
                audioPath=str(output), cacheHit=True, sha256=cache_key
            )

        audio = self._synthesize_with_retry(api_key=api_key, request=request)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        temporary = output.with_suffix(f".{os.getpid()}.tmp")
        temporary.write_bytes(audio)
        temporary.replace(output)
        return SynthesisResult(
            audioPath=str(output), cacheHit=False, sha256=cache_key
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
                self.sleep(float(2**attempt))
        raise RuntimeError("MiniMax synthesis failed")

    @staticmethod
    def _cache_key(request: SynthesisRequest) -> str:
        payload = request.model_dump(mode="json", by_alias=True)
        canonical = json.dumps(
            payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
