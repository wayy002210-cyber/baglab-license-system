from __future__ import annotations

import base64

import httpx

from app.voice.service import MiniMaxRateLimitError, SynthesisRequest


class MiniMaxTTS:
    base_url = "https://api.minimaxi.com/v1"

    def __init__(self, timeout: float = 90.0) -> None:
        self.timeout = timeout

    def list_voices(self, *, api_key: str) -> list[dict[str, object]]:
        response = httpx.get(
            f"{self.base_url}/get_voice",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=self.timeout,
        )
        self._raise_for_status(response)
        data = response.json()
        voices: list[dict[str, object]] = []
        for key in ("system_voice", "voice_cloning", "voice_generation"):
            value = data.get(key) or data.get("data", {}).get(key, [])
            if isinstance(value, list):
                voices.extend(item for item in value if isinstance(item, dict))
        return voices

    def synthesize(self, *, api_key: str, request: SynthesisRequest) -> bytes:
        response = httpx.post(
            f"{self.base_url}/t2a_v2",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": request.model,
                "text": request.text,
                "stream": False,
                "audio_setting": {
                    "sample_rate": 32000,
                    "bitrate": 128000,
                    "format": "mp3",
                    "channel": 1,
                },
                "voice_setting": {
                    "voice_id": request.voice_id,
                    "speed": request.speed,
                    "vol": request.volume,
                    "pitch": request.pitch,
                },
                "language_boost": request.language_boost,
            },
            timeout=self.timeout,
        )
        self._raise_for_status(response)
        data = response.json()
        audio = data.get("data", {}).get("audio")
        if not isinstance(audio, str) or not audio:
            raise RuntimeError("MiniMax returned an unexpected audio response")
        try:
            return bytes.fromhex(audio)
        except ValueError:
            try:
                return base64.b64decode(audio, validate=True)
            except ValueError as error:
                raise RuntimeError("MiniMax returned invalid audio data") from error

    @staticmethod
    def _raise_for_status(response: httpx.Response) -> None:
        if response.status_code == 429:
            raise MiniMaxRateLimitError("MiniMax rate limit reached")
        response.raise_for_status()
