from __future__ import annotations

import asyncio
import json
import subprocess
import threading
from pathlib import Path
from typing import Any, Protocol

from app.copywriting.service import GeneratedShot, RequestedShot, RewriteRequest
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
    TextStyle,
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
        encoding_lock: asyncio.Lock | None = None,
        tts_semaphore: asyncio.Semaphore | None = None,
    ) -> None:
        self.copywriter = copywriter
        self.voice = voice
        self.audio_probe = audio_probe
        self.exporter = exporter
        self.bailian_key = bailian_key
        self.minimax_key = minimax_key
        self.tts_limit = tts_semaphore or asyncio.Semaphore(3)
        self.cancel_events: dict[str, threading.Event] = {}
        self.worker = GenerationWorker(
            stages={
                "preparing_copy": self.prepare_copy,
                "generating_voice": self.generate_voice,
                "selecting_assets": self.select_assets,
                "composing": self.compose,
                "encoding": self.encode,
            },
            encoding_lock=encoding_lock,
            on_cancel=self._cancel_export,
            on_start=lambda task_id: self.cancel_events.__setitem__(
                task_id, threading.Event()
            ),
            on_finish=lambda task_id: self.cancel_events.pop(task_id, None),
        )

    async def run(self, request: TaskExecutionRequest) -> dict[str, Any]:
        return await self.worker.run(request)

    def _cancel_export(self, task_id: str) -> None:
        event = self.cancel_events.get(task_id)
        if event:
            event.set()

    async def prepare_copy(
        self, request: TaskExecutionRequest, context: dict[str, Any]
    ) -> dict[str, Any]:
        if request.snapshot.get("approved") and request.snapshot.get("shots"):
            return {
                **context,
                "shotPlans": [
                    GeneratedShot(
                        index=shot.get("index", index),
                        role=shot.get("role", "custom"),
                        assetCategoryId=shot["assetCategoryId"],
                        copywriting=shot["copywriting"],
                        durationMode=shot.get("durationMode", "voice"),
                        durationSec=(
                            shot.get("durationSec")
                            if shot.get("durationMode") == "fixed"
                            else None
                        ),
                        muteOriginal=shot.get("muteOriginal", True),
                    )
                    for index, shot in enumerate(request.snapshot["shots"])
                ],
            }
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
        voice_settings = request.snapshot["voice"]
        voice_id = voice_settings["voiceId"]
        saved_segments = request.snapshot.get("audioSegments") or []

        async def synthesize_shot(
            index: int, text: str
        ) -> tuple[Path, float]:
            saved = saved_segments[index] if index < len(saved_segments) else None
            if (
                saved
                and saved.get("status") == "ready"
                and saved.get("audioPath")
                and saved.get("durationSec")
            ):
                return Path(saved["audioPath"]), float(saved["durationSec"])
            if not text.strip():
                raise ValueError(f"第 {index + 1} 个镜头没有可生成配音的文案")
            async with self.tts_limit:
                try:
                    result = await asyncio.to_thread(
                        self.voice.synthesize,
                        api_key=self.minimax_key,
                        request=SynthesisRequest(
                            text=text,
                            voiceId=voice_id,
                            model=voice_settings.get("model", "speech-2.8-hd"),
                            emotion=voice_settings.get("emotion"),
                            speed=voice_settings.get("speed", 1),
                            volume=voice_settings.get("volume", 1),
                            pitch=voice_settings.get("pitch", 0),
                            languageBoost=voice_settings.get(
                                "languageBoost", "Chinese"
                            ),
                        ),
                    )
                except Exception as error:
                    raise RuntimeError(
                        f"第 {index + 1} 个镜头配音生成失败：{error}"
                    ) from error
            return Path(result.audio_path), float(result.duration_sec)

        generated = await asyncio.gather(
            *(
                synthesize_shot(index, shot.copywriting)
                for index, shot in enumerate(context["shotPlans"])
            )
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
        bgm_settings = request.snapshot.get("bgm") or {}
        media_settings = request.snapshot.get("media") or {}
        cursor = 0.0
        subtitles: list[SubtitleClip] = []
        videos: list[VideoClip] = []
        voices: list[AudioClip] = []
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
            subtitles.append(
                SubtitleClip(
                    start_sec=cursor,
                    end_sec=cursor + duration,
                    text=shot.copywriting,
                )
            )
            voices.append(
                AudioClip(path=context["voicePaths"][index], start_sec=cursor)
            )
            cursor += duration
        project = Project(
            output_path=Path(request.output_path),
            video_clips=videos,
            voice_clips=voices,
            subtitles=subtitles,
            bgm_path=(
                Path(request.snapshot["bgmPath"])
                if request.snapshot.get("bgmPath")
                else None
            ),
            bgm_volume=float(
                bgm_settings.get(
                    "volume",
                    media_settings.get("bgmVolume", 0.16),
                )
            ),
            video_bitrate_mbps=float(
                media_settings.get("videoBitrateMbps", 8)
            ),
            font_family=str(
                media_settings.get("fontFamily", "Microsoft YaHei")
            ),
            subtitle_style=_text_style(request.snapshot.get("subtitleStyle")),
            title_style=_text_style(request.snapshot.get("titleStyle")),
        )
        return {**context, "project": project}

    async def encode(
        self, request: TaskExecutionRequest, context: dict[str, Any]
    ) -> dict[str, Any]:
        encoder = (request.snapshot.get("media") or {}).get("encoder", "auto")
        await asyncio.to_thread(
            self.exporter.export,
            context["project"],
            encoder=None if encoder == "auto" else encoder,
            cancel_event=self.cancel_events[request.task_id],
            on_progress=context.get("emitEncodingProgress"),
        )
        return context


def _allocate_durations(
    texts: list[str],
    total_duration: float,
    minimum_duration: float = 0.5,
) -> list[float]:
    if not texts:
        return []
    if total_duration <= 0:
        raise ValueError("整篇配音时长必须大于 0")
    if total_duration <= len(texts) * minimum_duration:
        equal = total_duration / len(texts)
        return [
            total_duration - equal * index
            if index == len(texts) - 1
            else equal
            for index in range(len(texts))
        ]
    weights = [max(1, len("".join(text.split()))) for text in texts]
    distributable = total_duration - minimum_duration * len(texts)
    total_weight = sum(weights)
    durations: list[float] = []
    allocated = 0.0
    for index, weight in enumerate(weights):
        duration = (
            total_duration - allocated
            if index == len(texts) - 1
            else minimum_duration + distributable * weight / total_weight
        )
        durations.append(duration)
        allocated += duration
    return durations


def _text_style(value: dict[str, Any] | None) -> TextStyle | None:
    if not value:
        return None
    return TextStyle(
        font_family=str(value.get("fontFamily", "Microsoft YaHei")),
        font_size=int(value.get("fontSize", 58)),
        primary_color=str(value.get("primaryColor", "#FFFFFF")),
        outline_color=str(value.get("outlineColor", "#101010")),
        outline_width=float(value.get("outlineWidth", 4)),
        shadow_color=str(value.get("shadowColor", "#80000000")),
        shadow_x=float(value.get("shadowX", 1)),
        shadow_y=float(value.get("shadowY", 1)),
        alignment=int(value.get("alignment", 2)),
        margin_v=int(value.get("marginV", 170)),
        font_path=Path(value["fontPath"]) if value.get("fontPath") else None,
    )
