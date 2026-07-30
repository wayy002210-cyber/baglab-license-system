from __future__ import annotations

import os
import json
from pathlib import Path
from typing import AsyncIterator, Protocol

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from app.media.asset_scanner import (
    AssetScanner,
    FfmpegThumbnailer,
    Ffprobe,
    ScanResult,
)
from app.media.audio_library import (
    AudioLibrary,
    AudioLibraryResult,
    FfprobeAudioProbe,
)
from app.media.font_probe import FontMetadata, FontProbe, FontProbeError
from app.copywriting.bailian import BailianAPIError, BailianChat
from app.copywriting.service import (
    CopywritingService,
    RewriteRequest,
    RewriteResult,
    StructuredOutputError,
)
from app.copywriting.compliance import ComplianceRequest, ComplianceResult
from app.copywriting.topic_service import (
    ContentCreationService,
    CopywritingGenerationRequest,
    CopywritingResult,
    TopicGenerationRequest,
    TopicResult,
    TopicService,
)
from app.voice.minimax import MiniMaxTTS, MiniMaxVoiceClient
from app.voice.cloning import (
    CloneRequest,
    CloneResult,
    FfprobeSampleProbe,
    SampleMetadata,
    VoiceCloneService,
    VoiceSampleError,
)
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
from app.publisher.adapters import PublishRequest, PublishResult
from app.publisher.service import Platform, PublishingService


class CreateTaskRequest(BaseModel):
    templateId: str = Field(min_length=1)
    personaId: str = Field(min_length=1)
    count: int = Field(ge=1, le=20)

class ScanAssetsRequest(BaseModel):
    folder_path: str = Field(alias="folderPath", min_length=1)


class ValidateVoiceSampleRequest(BaseModel):
    sample_path: str = Field(alias="samplePath", min_length=1)


class ScanAudioLibraryRequest(BaseModel):
    folder_path: str = Field(alias="folderPath", min_length=1)
    recursive: bool = True


class ProbeFontRequest(BaseModel):
    font_path: str = Field(alias="fontPath", min_length=1)


class BailianConnectionRequest(BaseModel):
    model: str = Field(min_length=1)


class PublishAccountCheckRequest(BaseModel):
    platform: Platform
    user_data_dir: str = Field(alias="userDataDir", min_length=1)


class RunPublishRequest(PublishRequest):
    platform: Platform
    user_data_dir: str = Field(alias="userDataDir", min_length=1)


class Scanner(Protocol):
    def scan(self, root: Path) -> ScanResult: ...


class Copywriter(Protocol):
    def rewrite(
        self, *, api_key: str, model: str, request: RewriteRequest
    ) -> RewriteResult: ...


class ContentCreator(Protocol):
    def generate_topics(
        self, *, api_key: str, request: TopicGenerationRequest
    ) -> TopicResult: ...

    def generate_copywriting(
        self, *, api_key: str, request: CopywritingGenerationRequest
    ) -> CopywritingResult: ...

    def check_compliance(self, request: ComplianceRequest) -> ComplianceResult: ...


class VoiceProvider(Protocol):
    def list_voices(self, *, api_key: str) -> list[dict[str, str]]: ...

    def synthesize(
        self, *, api_key: str, request: SynthesisRequest
    ) -> SynthesisResult: ...


class VoiceCloner(Protocol):
    def validate_sample(self, path: Path) -> SampleMetadata: ...

    def clone(self, *, api_key: str, request: CloneRequest) -> CloneResult: ...

    def get(self, voice_id: str) -> CloneResult | None: ...


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


class Publisher(Protocol):
    def check_account(self, *, platform: Platform, user_data_dir: str) -> str: ...
    def connect_account(self, *, platform: Platform, user_data_dir: str) -> str: ...
    def publish(
        self,
        *,
        job_id: str,
        platform: Platform,
        user_data_dir: str,
        request: PublishRequest,
    ) -> PublishResult: ...

    def cancel(self, job_id: str) -> bool: ...


def create_app(
    session_token: str | None = None,
    asset_scanner: Scanner | None = None,
    copywriting_service: Copywriter | None = None,
    content_creation_service: ContentCreator | None = None,
    voice_service: VoiceProvider | None = None,
    voice_clone_service: VoiceCloner | None = None,
    encoder_detector: VideoEncoderDetector | None = None,
    task_runtime: GenerationTaskRuntime | None = None,
    publishing_service: Publisher | None = None,
    bailian_chat: BailianChat | None = None,
) -> FastAPI:
    token = session_token or os.environ.get("AUTOCUT_SESSION_TOKEN")
    if not token:
        raise RuntimeError("AUTOCUT_SESSION_TOKEN is required")

    app = FastAPI(title="AutoCut Local Service", version="0.1.0")
    ffmpeg_path = os.environ.get("AUTOCUT_FFMPEG", "ffmpeg")
    ffprobe_path = os.environ.get("AUTOCUT_FFPROBE", "ffprobe")
    scanner = asset_scanner or AssetScanner(
        Ffprobe(ffprobe_path),
        thumbnailer=FfmpegThumbnailer(
            Path(
                os.environ.get(
                    "AUTOCUT_THUMBNAIL_CACHE",
                    "backend-data/cache/thumbnails",
                )
            ),
            executable=ffmpeg_path,
        ),
    )
    audio_library = AudioLibrary(FfprobeAudioProbe(ffprobe_path))
    font_probe = FontProbe()
    chat = bailian_chat or BailianChat()
    copywriter = copywriting_service or CopywritingService(chat)
    content_creator = content_creation_service or ContentCreationService(
        TopicService(chat)
    )
    voice = voice_service or VoiceService(
        MiniMaxTTS(),
        cache_dir=Path(
            os.environ.get("AUTOCUT_VOICE_CACHE", "backend-data/cache/voice")
        ),
    )
    voice_cloner = voice_clone_service or VoiceCloneService(
        MiniMaxVoiceClient(), FfprobeSampleProbe(ffprobe_path)
    )
    video_encoder_detector = encoder_detector or EncoderDetector(ffmpeg=ffmpeg_path)
    generation_runtime = task_runtime or SecurePipelineRuntime(
        lambda bailian_key, minimax_key, encoding_lock, tts_semaphore: GenerationPipeline(
            copywriter=copywriter,
            voice=voice,
            audio_probe=AudioDurationProbe(ffprobe_path),
            exporter=Exporter(ffmpeg=ffmpeg_path),
            bailian_key=bailian_key,
            minimax_key=minimax_key,
            encoding_lock=encoding_lock,
            tts_semaphore=tts_semaphore,
        )
    )
    publisher = publishing_service or PublishingService()

    def raise_bailian_http(error: BailianAPIError) -> None:
        raise HTTPException(
            status_code=error.status_code,
            detail={"code": error.code, "message": str(error)},
        ) from error

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
        "/media/audio-library/scan",
        response_model=AudioLibraryResult,
        dependencies=[Depends(authorize)],
    )
    def scan_audio_library(
        payload: ScanAudioLibraryRequest,
    ) -> AudioLibraryResult:
        try:
            return audio_library.scan(
                Path(payload.folder_path), recursive=payload.recursive
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @app.post(
        "/media/fonts/probe",
        response_model=FontMetadata,
        dependencies=[Depends(authorize)],
    )
    def probe_font(payload: ProbeFontRequest) -> FontMetadata:
        try:
            return font_probe.probe(Path(payload.font_path))
        except FontProbeError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @app.post(
        "/copywriting/connection",
        dependencies=[Depends(authorize)],
    )
    def test_bailian_connection(
        payload: BailianConnectionRequest,
        x_bailian_key: str | None = Header(default=None),
    ) -> dict[str, str]:
        if not x_bailian_key:
            raise HTTPException(status_code=401, detail="请先配置百炼 API Key")
        try:
            chat.complete(
                api_key=x_bailian_key,
                model=payload.model,
                prompt='只返回 JSON：{"ok":true}',
            )
            return {"status": "connected", "model": payload.model}
        except BailianAPIError as error:
            raise_bailian_http(error)

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
                model=payload.model,
                request=payload,
            )
        except BailianAPIError as error:
            raise_bailian_http(error)
        except StructuredOutputError as error:
            raise HTTPException(status_code=502, detail=str(error)) from error

    @app.post(
        "/copywriting/topics",
        response_model=TopicResult,
        dependencies=[Depends(authorize)],
    )
    def generate_topics(
        payload: TopicGenerationRequest,
        x_bailian_key: str | None = Header(default=None),
    ) -> TopicResult:
        if not x_bailian_key:
            raise HTTPException(status_code=401, detail="请先配置百炼 API Key")
        try:
            return content_creator.generate_topics(
                api_key=x_bailian_key, request=payload
            )
        except BailianAPIError as error:
            raise_bailian_http(error)
        except StructuredOutputError as error:
            raise HTTPException(status_code=502, detail=str(error)) from error

    @app.post(
        "/copywriting/generate",
        response_model=CopywritingResult,
        dependencies=[Depends(authorize)],
    )
    def generate_copywriting(
        payload: CopywritingGenerationRequest,
        x_bailian_key: str | None = Header(default=None),
    ) -> CopywritingResult:
        if not x_bailian_key:
            raise HTTPException(status_code=401, detail="请先配置百炼 API Key")
        try:
            return content_creator.generate_copywriting(
                api_key=x_bailian_key, request=payload
            )
        except BailianAPIError as error:
            raise_bailian_http(error)
        except StructuredOutputError as error:
            raise HTTPException(status_code=502, detail=str(error)) from error

    @app.post(
        "/copywriting/compliance",
        response_model=ComplianceResult,
        dependencies=[Depends(authorize)],
    )
    def check_copywriting_compliance(
        payload: ComplianceRequest,
    ) -> ComplianceResult:
        return content_creator.check_compliance(payload)

    @app.get("/voices/connection", dependencies=[Depends(authorize)])
    def test_minimax_connection(
        x_minimax_key: str | None = Header(default=None),
    ) -> dict[str, int | str]:
        if not x_minimax_key:
            raise HTTPException(status_code=401, detail="请先配置 MiniMax API Key")
        try:
            voices = voice.list_voices(api_key=x_minimax_key)
            return {"status": "connected", "voiceCount": len(voices)}
        except Exception as error:
            status_code = getattr(error, "status_code", None)
            if status_code in (401, 403):
                raise HTTPException(
                    status_code=401,
                    detail="MiniMax API Key 无效或已失效，请在系统设置中更新密钥",
                ) from error
            if status_code == 429:
                raise HTTPException(
                    status_code=429,
                    detail="MiniMax 请求过于频繁，请稍后重试",
                ) from error
            raise HTTPException(
                status_code=502,
                detail=f"MiniMax 连接失败：{error}",
            ) from error

    @app.get("/voices", dependencies=[Depends(authorize)])
    def list_voices(
        x_minimax_key: str | None = Header(default=None),
    ) -> list[dict[str, str]]:
        if not x_minimax_key:
            raise HTTPException(status_code=401, detail="MiniMax API key is required")
        return voice.list_voices(api_key=x_minimax_key)

    @app.get("/voices/capabilities", dependencies=[Depends(authorize)])
    def voice_capabilities() -> dict[str, object]:
        return {
            "models": [
                "speech-2.8-hd",
                "speech-2.8-turbo",
                "speech-2.6-hd",
                "speech-2.6-turbo",
            ],
            "emotions": [
                "happy",
                "sad",
                "angry",
                "fearful",
                "disgusted",
                "surprised",
                "calm",
            ],
            "speedRange": [0.5, 2.0],
            "volumeRange": [0.0, 3.0],
            "pitchRange": [-12, 12],
            "sample": {
                "formats": ["mp3", "m4a", "wav"],
                "minDurationSec": 10,
                "maxDurationSec": 300,
                "maxSizeBytes": 20 * 1024 * 1024,
            },
        }

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

    @app.post(
        "/voices/sample/validate",
        response_model=SampleMetadata,
        dependencies=[Depends(authorize)],
    )
    def validate_voice_sample(
        payload: ValidateVoiceSampleRequest,
    ) -> SampleMetadata:
        try:
            return voice_cloner.validate_sample(Path(payload.sample_path))
        except VoiceSampleError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @app.post(
        "/voices/clones",
        response_model=CloneResult,
        dependencies=[Depends(authorize)],
    )
    def clone_voice(
        payload: CloneRequest,
        x_minimax_key: str | None = Header(default=None),
    ) -> CloneResult:
        if not x_minimax_key:
            raise HTTPException(status_code=401, detail="请先配置 MiniMax API Key")
        try:
            return voice_cloner.clone(api_key=x_minimax_key, request=payload)
        except VoiceSampleError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @app.get(
        "/voices/clones/{voice_id}",
        response_model=CloneResult,
        dependencies=[Depends(authorize)],
    )
    def get_voice_clone(voice_id: str) -> CloneResult:
        result = voice_cloner.get(voice_id)
        if not result:
            raise HTTPException(status_code=404, detail="未找到该克隆音色")
        return result

    @app.post(
        "/publish/accounts/{account_id}/check",
        dependencies=[Depends(authorize)],
    )
    def check_publish_account(
        account_id: str, payload: PublishAccountCheckRequest
    ) -> dict[str, str]:
        status = publisher.check_account(
            platform=payload.platform,
            user_data_dir=payload.user_data_dir,
        )
        return {"accountId": account_id, "status": status}

    @app.post(
        "/publish/accounts/{account_id}/connect",
        dependencies=[Depends(authorize)],
    )
    def connect_publish_account(
        account_id: str, payload: PublishAccountCheckRequest
    ) -> dict[str, str]:
        status = publisher.connect_account(
            platform=payload.platform,
            user_data_dir=payload.user_data_dir,
        )
        return {"accountId": account_id, "status": status}

    @app.post(
        "/publish/jobs/{job_id}/run",
        response_model=PublishResult,
        dependencies=[Depends(authorize)],
    )
    def run_publish_job(
        job_id: str, payload: RunPublishRequest
    ) -> PublishResult:
        request = PublishRequest.model_validate(
            payload.model_dump(mode="json", by_alias=True)
        )
        return publisher.publish(
            job_id=job_id,
            platform=payload.platform,
            user_data_dir=payload.user_data_dir,
            request=request,
        )

    @app.post(
        "/publish/jobs/{job_id}/cancel",
        status_code=202,
        dependencies=[Depends(authorize)],
    )
    def cancel_publish_job(job_id: str) -> dict[str, str]:
        if not publisher.cancel(job_id):
            raise HTTPException(
                status_code=409,
                detail="Publish submission has already started",
            )
        return {"status": "canceling", "jobId": job_id}

    return app


def run() -> None:
    import uvicorn

    port = int(os.environ.get("AUTOCUT_PORT", "0"))
    app = create_app()
    uvicorn.run(app, host="127.0.0.1", port=port)


if __name__ == "__main__":
    run()
