from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path
from typing import Any, Protocol

from app.copywriting.service import RequestedShot, RewriteRequest
from app.timeline.asset_selector import (
    AssetCandidate,
    AssetSelector,
    ShotRequirement,
)
from app.timeline.exporter import (
    AudioClip,
    Project,
    SubtitleClip,
    VideoClip,
)
from app.tasks.worker import GenerationWorker, TaskExecutionRequest
from app.voice.service import SynthesisRequest


class AudioDurationProbe:
    def __init__(self, ffprobe: str = "ffprobe") -> None:
        self.ffprobe = ffprobe

    def duration(self, path: Path) -> float:
        result = subprocess.run(
            [
                self.ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "json",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return float(json.loads(result.stdout)["format"]["duration"])


class GenerationPipeline:
    def __init__(
        self,
        *,
        copywriter: Any,
        voice: Any,
        audio_probe: Any,
        exporter: Any,
        bailian_key: str,
        minimax_key: str,
    ) -> None:
        self.copywriter = copywriter
        self.voice = voice
        self.audio_probe = audio_probe
        self.exporter = exporter
        self.bailian_key = bailian_key
        self.minimax_key = minimax_key
        self.tts_limit = asyncio.Semaphore(3)
        self.worker = GenerationWorker(
            stages={
                "preparing_copy": self.prepare_copy,
                "generating_voice": self.generate_voice,
                "selecting_assets": self.select_assets,
                "composing": self.compose,
                "encoding": self.encode,
            }
        )

    async def run(self, request: TaskExecutionRequest) -> dict[str, Any]:
        return await self.worker.run(request)

    async def prepare_copy(
        self, request: TaskExecutionRequest, context: dict[str, Any]
    ) -> dict[str, Any]:
        persona = request.snapshot["persona"]
        shots = request.snapshot["template"]["shots"]
        rewrite_request = RewriteRequest(
            sourceText="\n".join(str(shot.get("copywriting", "")) for shot in shots),
            personaName=persona["name"],
            brandFacts=persona.get("brandFacts", []),
            tone=persona.get("tone", ""),
            cta=persona.get("cta", ""),
            bannedWords=persona.get("bannedWords", []),
            shots=[
                RequestedShot(
                    index=shot.get("index", index),
                    role=shot["role"],
                    assetCategoryId=shot["assetCategoryId"],
                )
                for index, shot in enumerate(shots)
            ],
        )
        result = await asyncio.to_thread(
            self.copywriter.rewrite,
            api_key=self.bailian_key,
            model="qwen-plus",
            request=rewrite_request,
        )
        return {**context, "shotPlans": result.shots}

    async def generate_voice(
        self, request: TaskExecutionRequest, context: dict[str, Any]
    ) -> dict[str, Any]:
        voice_id = request.snapshot["voice"]["voiceId"]

        async def synthesize(shot):
            async with self.tts_limit:
                result = await asyncio.to_thread(
                    self.voice.synthesize,
                    api_key=self.minimax_key,
                    request=SynthesisRequest(
                        text=shot.copywriting, voiceId=voice_id
                    ),
                )
                path = Path(result.audio_path)
                duration = await asyncio.to_thread(self.audio_probe.duration, path)
                return path, duration

        generated = await asyncio.gather(
            *(synthesize(shot) for shot in context["shotPlans"])
        )
        return {
            **context,
            "voicePaths": [item[0] for item in generated],
            "durations": [item[1] for item in generated],
        }

    async def select_assets(
        self, request: TaskExecutionRequest, context: dict[str, Any]
    ) -> dict[str, Any]:
        assets = [
            AssetCandidate(
                asset_id=item["id"],
                category_id=item["categoryId"],
                file_path=item["filePath"],
                duration_sec=float(item["durationSec"]),
                status=item.get("status", "ready"),
            )
            for item in request.snapshot["assets"]
        ]
        requirements = [
            ShotRequirement(
                index=shot.index,
                category_id=shot.asset_category_id,
                duration_sec=context["durations"][index],
            )
            for index, shot in enumerate(context["shotPlans"])
        ]
        selected = AssetSelector(seed=request.seed).select(requirements, assets)
        return {**context, "selectedAssets": selected}

    async def compose(
        self, request: TaskExecutionRequest, context: dict[str, Any]
    ) -> dict[str, Any]:
        cursor = 0.0
        voice_clips: list[AudioClip] = []
        subtitles: list[SubtitleClip] = []
        videos: list[VideoClip] = []
        for index, shot in enumerate(context["shotPlans"]):
            duration = context["durations"][index]
            selected = context["selectedAssets"][index]
            videos.append(
                VideoClip(
                    path=Path(selected.file_path),
                    start_sec=selected.source_start_sec,
                    duration_sec=duration,
                    loop=selected.loop,
                )
            )
            voice_clips.append(
                AudioClip(path=context["voicePaths"][index], start_sec=cursor)
            )
            subtitles.append(
                SubtitleClip(
                    start_sec=cursor,
                    end_sec=cursor + duration,
                    text=shot.copywriting,
                )
            )
            cursor += duration
        project = Project(
            output_path=Path(request.output_path),
            video_clips=videos,
            voice_clips=voice_clips,
            subtitles=subtitles,
            bgm_path=(
                Path(request.snapshot["bgmPath"])
                if request.snapshot.get("bgmPath")
                else None
            ),
        )
        return {**context, "project": project}

    async def encode(
        self, request: TaskExecutionRequest, context: dict[str, Any]
    ) -> dict[str, Any]:
        await asyncio.to_thread(self.exporter.export, context["project"])
        return context
