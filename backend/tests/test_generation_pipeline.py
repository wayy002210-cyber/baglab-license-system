import asyncio
from pathlib import Path

from app.copywriting.service import RewriteResult
from app.tasks.pipeline import GenerationPipeline
from app.tasks.worker import TaskExecutionRequest
from app.voice.service import SynthesisResult


class Copywriter:
    def rewrite(self, *, api_key, model, request):
        assert api_key == "bailian"
        return RewriteResult(
            shots=[
                {
                    "index": 0,
                    "role": "hook",
                    "assetCategoryId": "factory",
                    "copywriting": "真实工厂，按需求生产。",
                    "durationMode": "voice",
                    "muteOriginal": True,
                }
            ]
        )


class Voice:
    def synthesize(self, *, api_key, request):
        assert api_key == "minimax"
        return SynthesisResult(
            audioPath=f"D:/voice/{request.voice_id}.mp3",
            cacheHit=False,
            sha256="a" * 64,
        )


class AudioProbe:
    def duration(self, path):
        return 3.2


class Exporter:
    def __init__(self):
        self.project = None

    def export(self, project, encoder=None, cancel_event=None):
        self.project = project


def test_pipeline_builds_export_project_from_snapshot() -> None:
    exporter = Exporter()
    pipeline = GenerationPipeline(
        copywriter=Copywriter(),
        voice=Voice(),
        audio_probe=AudioProbe(),
        exporter=exporter,
        bailian_key="bailian",
        minimax_key="minimax",
    )
    request = TaskExecutionRequest(
        taskId="task-1",
        seed=42,
        outputPath="D:/output/final.mp4",
        snapshot={
            "persona": {
                "name": "工厂号",
                "brandFacts": ["自有工厂"],
                "tone": "直接",
                "cta": "关注我们",
                "bannedWords": [],
            },
            "template": {
                "shots": [
                    {
                        "index": 0,
                        "role": "hook",
                        "assetCategoryId": "factory",
                        "copywriting": "介绍我们的工厂",
                        "durationMode": "voice",
                        "durationSec": None,
                        "muteOriginal": True,
                    }
                ]
            },
            "assets": [
                {
                    "id": "asset-1",
                    "categoryId": "factory",
                    "filePath": "D:/media/factory.mp4",
                    "durationSec": 8,
                    "status": "ready",
                }
            ],
            "voice": {"voiceId": "female-1"},
        },
    )

    context = asyncio.run(pipeline.run(request))

    assert context["shotPlans"][0].copywriting == "真实工厂，按需求生产。"
    assert context["durations"] == [3.2]
    assert exporter.project.output_path == Path("D:/output/final.mp4")
    assert exporter.project.video_clips[0].duration_sec == 3.2
    assert exporter.project.voice_clips[0].start_sec == 0
    assert exporter.project.subtitles[0].end_sec == 3.2


def test_pipeline_reuses_ready_audio_segments_and_passes_voice_settings() -> None:
    class TrackingVoice:
        def __init__(self):
            self.requests = []

        def synthesize(self, *, api_key, request):
            self.requests.append(request)
            return SynthesisResult(
                audioPath="D:/voice/new.mp3",
                cacheHit=False,
                sha256="b" * 64,
            )

    voice = TrackingVoice()
    pipeline = GenerationPipeline(
        copywriter=Copywriter(),
        voice=voice,
        audio_probe=AudioProbe(),
        exporter=Exporter(),
        bailian_key="bailian",
        minimax_key="minimax",
    )
    request = TaskExecutionRequest(
        taskId="task-audio",
        seed=1,
        outputPath="D:/output/final.mp4",
        snapshot={
            "voice": {
                "voiceId": "custom-voice",
                "emotion": "happy",
                "speed": 1.2,
                "volume": 1.4,
                "pitch": 2,
                "languageBoost": "Chinese",
            },
            "audioSegments": [
                {
                    "status": "ready",
                    "audioPath": "D:/voice/cached.mp3",
                    "durationSec": 4.5,
                },
                {"status": "failed", "audioPath": None, "durationSec": None},
            ],
        },
    )
    shot_plans = [
        type("Shot", (), {"copywriting": "已缓存"})(),
        type("Shot", (), {"copywriting": "需要生成"})(),
    ]

    result = asyncio.run(
        pipeline.generate_voice(request, {"shotPlans": shot_plans})
    )

    assert result["voicePaths"] == [
        Path("D:/voice/cached.mp3"),
        Path("D:/voice/new.mp3"),
    ]
    assert result["durations"] == [4.5, 3.2]
    assert len(voice.requests) == 1
    assert voice.requests[0].emotion == "happy"
    assert voice.requests[0].speed == 1.2
