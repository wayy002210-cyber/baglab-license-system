from __future__ import annotations

import os
import json
from pathlib import Path
from typing import AsyncIterator, Protocol

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
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
from app.timeline.exporter import EncoderDetector, Exporter
from app.tasks.runtime import (
    TaskAlreadyRunningError,
    TaskNotFoundError,
    TaskRuntime,
)
from app.tasks.worker import GenerationWorker, TaskEvent, TaskExecutionRequest
from app.tasks.pipeline import AudioDurationProbe, GenerationPipeline
from app.tasks.secure_runtime import SecurePipelineRuntime


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


class GenerationTaskRuntime(Protocol):
    async def start(
        self,
        request: TaskExecutionRequest,
        *,
        bailian_key: str | None = None,
        minimax_key: str | None = None,
    ) -> None: ...

    def latest(self, task_id: str) -> TaskEvent: ...

    def cancel(self, task_id: str) -> None: ...

    async def retry(self, task_id: str) -> None: ...

    def stream(
        self, task_id: str, cursor: int = 0
    ) -> AsyncIterator[tuple[int, TaskEvent]]: ...


def create_app(
    session_token: str | None = None,
    asset_scanner: Scanner | None = None,
    copywriting_service: Copywriter | None = None,
    voice_service: VoiceProvider | None = None,
    encoder_detector: VideoEncoderDetector | None = None,
    task_runtime: GenerationTaskRuntime | None = None,
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
    generation_runtime = task_runtime or SecurePipelineRuntime(
        lambda bailian_key, minimax_key, encoding_lock, tts_semaphore: GenerationPipeline(
            copywriter=copywriter,
            voice=voice,
            audio_probe=AudioDurationProbe(),
            exporter=Exporter(),
            bailian_key=bailian_key,
            minimax_key=minimax_key,
            encoding_lock=encoding_lock,
            tts_semaphore=tts_semaphore,
        )
    )

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
        "/tasks/{task_id}/run",
        status_code=202,
        dependencies=[Depends(authorize)],
    )
    async def run_task(
        task_id: str,
        payload: TaskExecutionRequest,
        x_bailian_key: str | None = Header(default=None),
        x_minimax_key: str | None = Header(default=None),
    ) -> dict[str, str]:
        if task_id != payload.task_id:
            raise HTTPException(status_code=400, detail="Task ID mismatch")
        try:
            await generation_runtime.start(
                payload,
                bailian_key=x_bailian_key,
                minimax_key=x_minimax_key,
            )
        except ValueError as error:
            raise HTTPException(status_code=401, detail=str(error)) from error
        except TaskAlreadyRunningError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return {"status": "accepted", "taskId": task_id}

    @app.get(
        "/tasks/{task_id}",
        response_model=TaskEvent,
        dependencies=[Depends(authorize)],
    )
    def task_status(task_id: str) -> TaskEvent:
        try:
            return generation_runtime.latest(task_id)
        except TaskNotFoundError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error

    @app.post(
        "/tasks/{task_id}/cancel",
        status_code=202,
        dependencies=[Depends(authorize)],
    )
    def cancel_task(task_id: str) -> dict[str, str]:
        try:
            generation_runtime.cancel(task_id)
        except TaskNotFoundError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        return {"status": "canceling", "taskId": task_id}

    @app.post(
        "/tasks/{task_id}/retry",
        status_code=202,
        dependencies=[Depends(authorize)],
    )
    async def retry_task(task_id: str) -> dict[str, str]:
        try:
            await generation_runtime.retry(task_id)
        except TaskNotFoundError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except TaskAlreadyRunningError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return {"status": "accepted", "taskId": task_id}

    @app.get(
        "/tasks/{task_id}/events",
        dependencies=[Depends(authorize)],
    )
    def task_events(
        task_id: str,
        last_event_id: int = Header(default=0, alias="Last-Event-ID"),
    ) -> StreamingResponse:
        async def generate():
            try:
                async for event_id, event in generation_runtime.stream(
                    task_id, last_event_id
                ):
                    payload = json.dumps(
                        event.model_dump(mode="json", by_alias=True),
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                    yield f"id: {event_id}\nevent: task\ndata: {payload}\n\n"
            except TaskNotFoundError:
                yield (
                    "event: error\ndata: "
                    '{"error":"Task not found"}\n\n'
                )

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

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
