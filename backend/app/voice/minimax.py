from __future__ import annotations

import base64

import httpx

from app.voice.cloning import CloneRequest
from app.voice.service import MiniMaxRateLimitError, SynthesisRequest


class MiniMaxAPIError(RuntimeError):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code


class MiniMaxTTS:
    base_url = "https://api.minimaxi.com/v1"

    def __init__(self, timeout: float = 90.0) -> None:
        self.timeout = timeout

    def list_voices(self, *, api_key: str) -> list[dict[str, object]]:
        response = httpx.post(
            f"{self.base_url}/get_voice",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"voice_type": "all"},
            timeout=self.timeout,
        )
        self._raise_for_status(response)
        data = response.json()
        self._raise_provider_error(data)
        voices: list[dict[str, object]] = []
        kinds = {
            "system_voice": "system",
            "voice_cloning": "clone",
            "voice_generation": "generated",
        }
        for key, kind in kinds.items():
            value = data.get(key) or data.get("data", {}).get(key, [])
            if isinstance(value, list):
                voices.extend(
                    {**item, "kind": kind}
                    for item in value
                    if isinstance(item, dict)
                )
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
                    **(
                        {"emotion": request.emotion}
                        if request.emotion is not None
                        else {}
                    ),
                },
                "language_boost": request.language_boost,
            },
            timeout=self.timeout,
        )
        self._raise_for_status(response)
        data = response.json()
        self._raise_provider_error(data)
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
            raise MiniMaxRateLimitError("MiniMax 请求过于频繁，请稍后重试")
        if response.is_error:
            raise MiniMaxAPIError(
                response.status_code,
                MiniMaxTTS._error_message(response),
            )

    @staticmethod
    def _error_message(response: httpx.Response) -> str:
        try:
            data = response.json()
        except ValueError:
            data = {}
        base_response = data.get("base_resp", {}) if isinstance(data, dict) else {}
        message = (
            base_response.get("status_msg")
            if isinstance(base_response, dict)
            else None
        )
        return str(message or f"MiniMax 服务返回错误（HTTP {response.status_code}）")

    @staticmethod
    def _raise_provider_error(data: object) -> None:
        if not isinstance(data, dict):
            raise RuntimeError("MiniMax 返回了无法识别的数据")
        base_response = data.get("base_resp", {})
        if not isinstance(base_response, dict):
            return
        status_code = base_response.get("status_code", 0)
        if status_code not in (0, None):
            message = str(base_response.get("status_msg") or f"MiniMax 错误 {status_code}")
            normalized = message.lower()
            if "rate limit" in normalized or "rpm" in normalized:
                raise MiniMaxRateLimitError(message)
            raise MiniMaxAPIError(
                int(status_code),
                message,
            )


class MiniMaxVoiceClient:
    base_url = "https://api.minimaxi.com/v1"

    def __init__(self, timeout: float = 90.0) -> None:
        self.timeout = timeout

    def upload_clone_sample(self, *, api_key: str, path) -> int:
        with path.open("rb") as sample:
            response = httpx.post(
                f"{self.base_url}/files/upload",
                headers={"Authorization": f"Bearer {api_key}"},
                data={"purpose": "voice_clone"},
                files={"file": (path.name, sample)},
                timeout=self.timeout,
            )
        self._validate_response(response)
        file_id = response.json().get("file", {}).get("file_id")
        if not isinstance(file_id, int):
            raise RuntimeError("MiniMax 未返回声音样本文件 ID")
        return file_id

    def clone_voice(
        self, *, api_key: str, file_id: int, request: CloneRequest
    ) -> dict[str, object]:
        payload: dict[str, object] = {
            "file_id": file_id,
            "voice_id": request.voice_id,
            "need_noise_reduction": request.need_noise_reduction,
            "need_volume_normalization": request.need_volume_normalization,
            "aigc_watermark": False,
        }
        if request.preview_text:
            payload.update(
                {
                    "text": request.preview_text,
                    "model": request.model,
                    "language_boost": request.language_boost,
                }
            )
        response = httpx.post(
            f"{self.base_url}/voice_clone",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=self.timeout,
        )
        self._validate_response(response)
        data = response.json()
        return data if isinstance(data, dict) else {}

    @staticmethod
    def _validate_response(response: httpx.Response) -> None:
        if response.status_code == 429:
            raise MiniMaxRateLimitError("MiniMax 请求过于频繁，请稍后重试")
        if response.is_error:
            raise MiniMaxAPIError(
                response.status_code,
                MiniMaxTTS._error_message(response),
            )
        data = response.json()
        base_response = data.get("base_resp", {})
        status_code = base_response.get("status_code", 0)
        if status_code != 0:
            raise RuntimeError(
                str(base_response.get("status_msg") or f"MiniMax 错误 {status_code}")
            )
