from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from app.media.asset_scanner import AssetScanner, Ffprobe, ScanResult
from app.copywriting.bailian import BailianChat
from app.copywriting.service import (
    CopywritingService,
    RewriteRequest,
    RewriteResult,
    StructuredOutputError,
)
from app.voice.minimax import MiniMaxTTS
from app.voice.service import SynthesisRequest, SynthesisResult, VoiceService
from app.timeline.exporter import EncoderDetector


class CreateTaskRequest(BaseModel):
    templateId: str = Field(min_length=1)
    personaId: str = Field(min_length=1)
    count: int = Field(ge=1, le=20)

class ScanAssetsRequest(BaseModel):
    folder_path: str = Field(alias="folderPath", min_length=1)


class Scanner(Protocol):
    def scan(self, root: Path) -> ScanResult: ...


class Copywriter(Protocol):
    def rewrite(
        self, *, api_key: str, model: str, request: RewriteRequest
    ) -> RewriteResult: ...


class VoiceProvider(Protocol):
    def list_voices(self, *, api_key: str) -> list[dict[str, str]]: ...

    def synthesize(
        self, *, api_key: str, request: SynthesisRequest
    ) -> SynthesisResult: ...


class VideoEncoderDetector(Protocol):
    def detect(self) -> str: ...


def create_app(
    session_token: str | None = None,
    asset_scanner: Scanner | None = None,
    copywriting_service: Copywriter | None = None,
    voice_service: VoiceProvider | None = None,
    encoder_detector: VideoEncoderDetector | None = None,
) -> FastAPI:
    token = session_token or os.environ.get("AUTOCUT_SESSION_TOKEN")
    if not token:
        raise RuntimeError("AUTOCUT_SESSION_TOKEN is required")

    app = FastAPI(title="AutoCut Local Service", version="0.1.0")
    scanner = asset_scanner or AssetScanner(Ffprobe())
    copywriter = copywriting_service or CopywritingService(BailianChat())
    voice = voice_service or VoiceService(
        MiniMaxTTS(),
        cache_dir=Path(
            os.environ.get("AUTOCUT_VOICE_CACHE", "backend-data/cache/voice")
        ),
    )
    video_encoder_detector = encoder_detector or EncoderDetector()

    def authorize(x_autocut_token: str | None = Header(default=None)) -> None:
        if x_autocut_token != token:
            raise HTTPException(status_code=401, detail="Invalid session token")

    @app.get("/health", dependencies=[Depends(authorize)])
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "autocut-backend"}

    @app.get("/media/gpu-encoder", dependencies=[Depends(authorize)])
    def gpu_encoder() -> dict[str, str | bool]:
        encoder = video_encoder_detector.detect()
        return {
            "encoder": encoder,
            "hardwareAccelerated": encoder != "libx264",
        }

    @app.post("/tasks", status_code=201, dependencies=[Depends(authorize)])
    def create_task(payload: CreateTaskRequest) -> dict[str, object]:
        return {"status": "queued", "count": payload.count}

    @app.post(
        "/assets/scan",
        response_model=ScanResult,
        dependencies=[Depends(authorize)],
    )
    def scan_assets(payload: ScanAssetsRequest) -> ScanResult:
        try:
            return scanner.scan(Path(payload.folder_path))
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @app.post(
        "/copywriting/rewrite",
        response_model=RewriteResult,
        dependencies=[Depends(authorize)],
    )
    def rewrite_copywriting(
        payload: RewriteRequest,
        x_bailian_key: str | None = Header(default=None),
    ) -> RewriteResult:
        if not x_bailian_key:
            raise HTTPException(status_code=401, detail="Bailian API key is required")
        try:
            return copywriter.rewrite(
                api_key=x_bailian_key,
                model="qwen-plus",
                request=payload,
            )
        except StructuredOutputError as error:
            raise HTTPException(status_code=502, detail=str(error)) from error

    @app.get("/voices", dependencies=[Depends(authorize)])
    def list_voices(
        x_minimax_key: str | None = Header(default=None),
    ) -> list[dict[str, str]]:
        if not x_minimax_key:
            raise HTTPException(status_code=401, detail="MiniMax API key is required")
        return voice.list_voices(api_key=x_minimax_key)

    @app.post(
        "/voices/synthesize",
        response_model=SynthesisResult,
        dependencies=[Depends(authorize)],
    )
    def synthesize_voice(
        payload: SynthesisRequest,
        x_minimax_key: str | None = Header(default=None),
    ) -> SynthesisResult:
        if not x_minimax_key:
            raise HTTPException(status_code=401, detail="MiniMax API key is required")
        return voice.synthesize(api_key=x_minimax_key, request=payload)

    return app


def run() -> None:
    import uvicorn

    port = int(os.environ.get("AUTOCUT_PORT", "0"))
    app = create_app()
    uvicorn.run(app, host="127.0.0.1", port=port)


if __name__ == "__main__":
    run()
