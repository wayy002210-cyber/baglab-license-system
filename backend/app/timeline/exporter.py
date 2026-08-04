from __future__ import annotations

import subprocess
import threading
import time
import math
import os
import json
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from .subtitle_layout import layout_subtitle_event


@dataclass(frozen=True)
class VideoClip:
    path: Path
    start_sec: float
    duration_sec: float
    loop: bool = False
    source_duration_sec: float | None = None


@dataclass(frozen=True)
class AudioClip:
    path: Path
    start_sec: float
    volume: float = 1.0


@dataclass(frozen=True)
class SubtitleClip:
    start_sec: float
    end_sec: float
    text: str


@dataclass(frozen=True)
class TitleClip:
    start_sec: float
    end_sec: float
    text: str


@dataclass(frozen=True)
class TextStyle:
    font_family: str = "Microsoft YaHei"
    font_size: int = 58
    bold: bool = False
    italic: bool = False
    underline: bool = False
    letter_spacing: float = 0
    scale: float = 100
    opacity: float = 100
    primary_color: str = "#FFFFFF"
    outline_color: str = "#101010"
    outline_width: float = 4
    shadow_color: str = "#80000000"
    shadow_x: float = 1
    shadow_y: float = 1
    shadow_blur: float = 0
    alignment: int = 2
    margin_v: int = 170
    position_x: int | None = None
    position_y: int | None = None
    font_path: Path | None = None


@dataclass(frozen=True)
class Project:
    output_path: Path
    video_clips: list[VideoClip]
    work_dir: Path | None = None
    voice_clips: list[AudioClip] = field(default_factory=list)
    subtitles: list[SubtitleClip] = field(default_factory=list)
    titles: list[TitleClip] = field(default_factory=list)
    bgm_path: Path | None = None
    bgm_duration_sec: float | None = None
    width: int = 1080
    height: int = 1920
    fps: int = 30
    bgm_volume: float = 0.16
    video_bitrate_mbps: float = 8
    font_family: str = "Microsoft YaHei"
    subtitle_style: TextStyle | None = None
    title_style: TextStyle | None = None

    @property
    def duration_sec(self) -> float:
        return sum(clip.duration_sec for clip in self.video_clips)


class EncoderDetector:
    priority = ("h264_amf", "h264_nvenc", "h264_qsv")

    def __init__(
        self,
        *,
        ffmpeg: str = "ffmpeg",
        runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
    ) -> None:
        self.ffmpeg = ffmpeg
        self.runner = runner

    def detect(self) -> str:
        result = self.runner(
            [self.ffmpeg, "-hide_banner", "-encoders"],
            capture_output=True,
            text=True,
            check=False,
        )
        encoder_output = f"{result.stdout}\n{result.stderr}"
        for encoder in self.priority:
            if encoder not in encoder_output:
                continue
            probe = self.runner(
                [
                    self.ffmpeg,
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "color=size=128x128:rate=30",
                    "-frames:v",
                    "3",
                    "-vf",
                    "format=nv12",
                    "-c:v",
                    encoder,
                    "-b:v",
                    "1M",
                    "-f",
                    "null",
                    "-",
                ],
                capture_output=True,
                text=True,
                check=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            if probe.returncode == 0:
                return encoder
        return "libx264"

    def choose(self, encoder_output: str) -> str:
        for encoder in self.priority:
            if encoder in encoder_output:
                return encoder
        return "libx264"


class ExportCanceledError(RuntimeError):
    pass


class Exporter:
    def __init__(
        self,
        *,
        ffmpeg: str = "ffmpeg",
        runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
        process_factory: Callable[..., subprocess.Popen[str]] = subprocess.Popen,
        validator: Callable[[Path], bool] | None = None,
        progress_interval_sec: float = 5.0,
    ) -> None:
        self.ffmpeg = ffmpeg
        self.runner = runner
        self.process_factory = process_factory
        self.progress_interval_sec = progress_interval_sec
        self.require_output = (
            runner is subprocess.run and process_factory is subprocess.Popen
        )
        self.validator = validator or (
            self._validate_output
            if self.require_output
            else lambda _path: True
        )

    def build_command(
        self, project: Project, *, encoder: str = "libx264"
    ) -> list[str]:
        if not project.video_clips:
            raise ValueError("Project requires at least one video clip")

        command = [
            self.ffmpeg,
            "-hide_banner",
            "-nostats",
            "-progress",
            "pipe:1",
            "-filter_complex_threads",
            "2",
            "-y",
        ]
        for clip in project.video_clips:
            if clip.loop:
                if not clip.source_duration_sec or clip.source_duration_sec <= 0:
                    raise ValueError(
                        "Looped video requires a positive source duration"
                    )
                repeats = max(
                    1,
                    math.ceil(
                        (clip.start_sec + clip.duration_sec)
                        / clip.source_duration_sec
                    )
                    - 1,
                )
                command.extend(["-stream_loop", str(repeats)])
            command.extend(["-i", str(clip.path)])
        for clip in project.voice_clips:
            command.extend(["-i", str(clip.path)])
        if project.bgm_path:
            if not project.bgm_duration_sec or project.bgm_duration_sec <= 0:
                raise ValueError("BGM requires a positive source duration")
            repeats = max(
                0,
                math.ceil(project.duration_sec / project.bgm_duration_sec) - 1,
            )
            if repeats:
                command.extend(["-stream_loop", str(repeats)])
            command.extend(["-i", str(project.bgm_path)])

        filters: list[str] = []
        video_labels: list[str] = []
        for index, clip in enumerate(project.video_clips):
            label = f"v{index}"
            filters.append(
                f"[{index}:v]trim=start={clip.start_sec}:duration={clip.duration_sec},"
                f"setpts=PTS-STARTPTS,"
                f"scale={project.width}:{project.height}:"
                "force_original_aspect_ratio=increase,"
                f"crop={project.width}:{project.height},"
                f"fps={project.fps},format=yuv420p,setsar=1[{label}]"
            )
            video_labels.append(f"[{label}]")
        filters.append(
            "".join(video_labels)
            + f"concat=n={len(video_labels)}:v=1:a=0[vconcat]"
        )

        video_output = "vconcat"
        if project.subtitles:
            subtitle_path = project.output_path.with_suffix(".ass")
            escaped = _escape_ffmpeg_filter_path(subtitle_path)
            filters.append(f"[vconcat]subtitles='{escaped}'[vout]")
            video_output = "vout"

        audio_labels: list[str] = []
        audio_input_offset = len(project.video_clips)
        for index, clip in enumerate(project.voice_clips):
            input_index = audio_input_offset + index
            delay_ms = max(0, round(clip.start_sec * 1000))
            label = f"voice{index}"
            filters.append(
                f"[{input_index}:a]adelay={delay_ms}|{delay_ms},"
                f"volume={clip.volume}[{label}]"
            )
            audio_labels.append(f"[{label}]")

        if project.bgm_path:
            bgm_input = audio_input_offset + len(project.voice_clips)
            fade_out_start = max(0, project.duration_sec - 1)
            filters.append(
                f"[{bgm_input}:a]atrim=duration={project.duration_sec},"
                "asetpts=PTS-STARTPTS,"
                f"volume={project.bgm_volume},afade=t=in:st=0:d=1,"
                f"afade=t=out:st={fade_out_start}:d=1[bgm]"
            )
            audio_labels.append("[bgm]")

        if audio_labels:
            filters.append(
                "".join(audio_labels)
                + f"amix=inputs={len(audio_labels)}:"
                "duration=longest:dropout_transition=0[aout]"
            )

        command.extend(["-filter_complex", ";".join(filters), "-map", f"[{video_output}]"])
        if audio_labels:
            command.extend(["-map", "[aout]"])
        command.extend(
            [
                "-c:v",
                encoder,
                "-b:v",
                f"{project.video_bitrate_mbps:g}M",
                "-maxrate",
                f"{project.video_bitrate_mbps + 2:g}M",
                "-bufsize",
                f"{project.video_bitrate_mbps * 2:g}M",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-ar",
                "48000",
                "-movflags",
                "+faststart",
                "-t",
                str(project.duration_sec),
                str(project.output_path),
            ]
        )
        encoder_options = _encoder_options(encoder)
        bitrate_index = command.index("-b:v")
        command[bitrate_index:bitrate_index] = encoder_options
        return command

    def export(
        self,
        project: Project,
        *,
        encoder: str | None = None,
        cancel_event: threading.Event | None = None,
        on_progress: Callable[[float], None] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        project.output_path.parent.mkdir(parents=True, exist_ok=True)
        work_dir = project.work_dir or project.output_path.parent
        work_dir.mkdir(parents=True, exist_ok=True)
        partial_path = work_dir / f"{project.output_path.stem}.partial{project.output_path.suffix}"
        partial_ass_path = partial_path.with_suffix(".ass")
        partial_path.unlink(missing_ok=True)
        partial_ass_path.unlink(missing_ok=True)
        partial_project = Project(
            **{**project.__dict__, "output_path": partial_path}
        )
        if project.subtitles:
            write_ass_subtitles(
                partial_ass_path,
                project.subtitles,
                font_family=project.font_family,
                titles=project.titles,
                subtitle_style=project.subtitle_style,
                title_style=project.title_style,
            )
        selected_encoder = encoder or EncoderDetector(
            ffmpeg=self.ffmpeg, runner=self.runner
        ).detect()
        try:
            result = self._execute(
                self.build_command(partial_project, encoder=selected_encoder),
                cancel_event,
                duration_sec=project.duration_sec,
                on_progress=on_progress,
            )
        except ExportCanceledError:
            partial_path.unlink(missing_ok=True)
            partial_ass_path.unlink(missing_ok=True)
            raise
        except subprocess.CalledProcessError:
            if selected_encoder == "libx264":
                partial_path.unlink(missing_ok=True)
                partial_ass_path.unlink(missing_ok=True)
                raise
            try:
                result = self._execute(
                    self.build_command(partial_project, encoder="libx264"),
                    cancel_event,
                    duration_sec=project.duration_sec,
                    on_progress=on_progress,
                )
            except Exception:
                partial_path.unlink(missing_ok=True)
                partial_ass_path.unlink(missing_ok=True)
                raise
        if not partial_path.exists() and not self.require_output:
            return result
        if not self.validator(partial_path):
            partial_path.unlink(missing_ok=True)
            partial_ass_path.unlink(missing_ok=True)
            raise RuntimeError("Output media validation failed")
        os.replace(partial_path, project.output_path)
        partial_ass_path.unlink(missing_ok=True)
        return result

    def _validate_output(self, path: Path) -> bool:
        ffprobe = str(Path(self.ffmpeg).with_name("ffprobe.exe"))
        result = self.runner(
            [
                ffprobe, "-v", "error",
                "-show_entries", "stream=codec_type,codec_name,width,height:format=duration,size",
                "-of", "json", str(path),
            ],
            capture_output=True, text=True, check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if result.returncode != 0 or not path.exists() or path.stat().st_size < 1024:
            return False
        try:
            payload = json.loads(result.stdout)
            streams = payload.get("streams") or []
            duration = float((payload.get("format") or {}).get("duration") or 0)
            return (
                duration > 0
                and any(item.get("codec_type") == "video" for item in streams)
                and any(item.get("codec_type") == "audio" for item in streams)
            )
        except (TypeError, ValueError, json.JSONDecodeError):
            return False

    def _execute(
        self,
        command: list[str],
        cancel_event: threading.Event | None,
        *,
        duration_sec: float,
        on_progress: Callable[[float], None] | None,
    ) -> subprocess.CompletedProcess[str]:
        if cancel_event is None and on_progress is None:
            return self.runner(
                command, capture_output=True, text=True, check=True
            )
        process = self.process_factory(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        stdout_lines: list[str] = []
        stderr_tail: deque[str] = deque(maxlen=200)
        last_progress = 0.0
        last_feedback_at = time.monotonic()

        def read_stdout() -> None:
            nonlocal last_progress
            stream = getattr(process, "stdout", None)
            if stream is None:
                return
            for raw_line in stream:
                line = raw_line.strip()
                stdout_lines.append(raw_line)
                if line.startswith("out_time_ms=") and duration_sec > 0:
                    try:
                        elapsed = float(line.split("=", 1)[1]) / 1_000_000
                    except ValueError:
                        continue
                    progress = min(0.999, max(last_progress, elapsed / duration_sec))
                    if progress > last_progress:
                        last_progress = progress
                        if on_progress:
                            on_progress(progress)
                elif line == "progress=end" and last_progress < 1:
                    last_progress = 1.0
                    if on_progress:
                        on_progress(1.0)

        def read_stderr() -> None:
            stream = getattr(process, "stderr", None)
            if stream is None:
                return
            for line in stream:
                stderr_tail.append(line)

        stdout_thread = threading.Thread(target=read_stdout, daemon=True)
        stderr_thread = threading.Thread(target=read_stderr, daemon=True)
        stdout_thread.start()
        stderr_thread.start()
        while process.poll() is None:
            if cancel_event is not None and cancel_event.is_set():
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                stdout_thread.join(timeout=1)
                stderr_thread.join(timeout=1)
                raise ExportCanceledError("FFmpeg export was canceled")
            now = time.monotonic()
            if (
                on_progress is not None
                and now - last_feedback_at >= self.progress_interval_sec
            ):
                on_progress(last_progress)
                last_feedback_at = now
            time.sleep(0.1)
        stdout_thread.join(timeout=5)
        stderr_thread.join(timeout=5)
        stdout = "".join(stdout_lines)
        stderr = "".join(stderr_tail)
        result = subprocess.CompletedProcess(
            command, process.returncode or 0, stdout, stderr
        )
        if result.returncode != 0:
            raise subprocess.CalledProcessError(
                result.returncode, command, stdout, stderr
            )
        return result


def write_ass_subtitles(
    path: Path,
    subtitles: list[SubtitleClip],
    *,
    font_family: str = "Microsoft YaHei",
    titles: list[TitleClip] | None = None,
    subtitle_style: TextStyle | None = None,
    title_style: TextStyle | None = None,
) -> None:
    subtitle_style = subtitle_style or TextStyle(font_family=font_family)
    title_style = title_style or TextStyle(
        font_family=font_family,
        font_size=82,
        primary_color="#FFE600",
        alignment=8,
        margin_v=120,
    )
    titles = titles or []
    subtitle_ass = _ass_style("Subtitle", subtitle_style)
    title_ass = _ass_style("Title", title_style)
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{subtitle_ass}
{title_ass}

[Events]
Format: Layer, Start, End, Style, Text
"""
    subtitle_position = _ass_position(subtitle_style)
    title_position = _ass_position(title_style)
    subtitle_effect = _ass_effect(subtitle_style)
    title_effect = _ass_effect(title_style)
    laid_out_subtitles = [
        laid_out
        for item in subtitles
        for laid_out in layout_subtitle_event(
            start_sec=item.start_sec,
            end_sec=item.end_sec,
            text=item.text,
            font_size=subtitle_style.font_size,
            scale=subtitle_style.scale,
            letter_spacing=subtitle_style.letter_spacing,
            outline_width=subtitle_style.outline_width,
        )
    ]
    lines = [
        f"Dialogue: 0,{_ass_time(item.start_sec)},{_ass_time(item.end_sec)},"
        f"Subtitle,{subtitle_position}{subtitle_effect}{_escape_ass_text(item.text)}"
        for item in laid_out_subtitles
    ]
    lines.extend(
        f"Dialogue: 1,{_ass_time(item.start_sec)},{_ass_time(item.end_sec)},"
        f"Title,{title_position}{title_effect}{_escape_ass_text(item.text)}"
        for item in titles
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(header + "\n".join(lines) + "\n", encoding="utf-8")


def _ass_position(style: TextStyle) -> str:
    if style.position_x is None or style.position_y is None:
        return ""
    return rf"{{\pos({style.position_x},{style.position_y})}}"


def _ass_effect(style: TextStyle) -> str:
    return rf"{{\blur{style.shadow_blur:g}}}" if style.shadow_blur > 0 else ""


def _ass_style(name: str, style: TextStyle) -> str:
    shadow = max(abs(style.shadow_x), abs(style.shadow_y))
    return (
        f"Style: {name},{style.font_family},{style.font_size},"
        f"{_ass_color(_with_opacity(style.primary_color, style.opacity))},&H000000FF,"
        f"{_ass_color(style.outline_color)},{_ass_color(style.shadow_color)},"
        f"{-1 if style.bold else 0},{-1 if style.italic else 0},{-1 if style.underline else 0},0,"
        f"{style.scale:g},{style.scale:g},{style.letter_spacing:g},0,1,"
        f"{style.outline_width:g},{shadow:g},{style.alignment},80,80,{style.margin_v},1"
    )


def _with_opacity(color: str, opacity: float) -> str:
    value = color.removeprefix("#")
    if len(value) != 6:
        return color
    alpha = round(255 * (1 - max(0, min(100, opacity)) / 100))
    return f"#{value}{alpha:02X}"


def _ass_color(color: str) -> str:
    value = color.removeprefix("#")
    if len(value) == 6:
        value = "00" + value
    if len(value) != 8:
        raise ValueError(f"Invalid text color: {color}")
    red, green, blue, alpha = value[0:2], value[2:4], value[4:6], value[6:8]
    return f"&H{alpha}{blue}{green}{red}"


def _ass_time(seconds: float) -> str:
    centiseconds = max(0, round(seconds * 100))
    hours, remainder = divmod(centiseconds, 360_000)
    minutes, remainder = divmod(remainder, 6_000)
    whole_seconds, fraction = divmod(remainder, 100)
    return f"{hours}:{minutes:02d}:{whole_seconds:02d}.{fraction:02d}"


def _escape_ass_text(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("{", "\\{")
        .replace("}", "\\}")
        .replace("\r\n", "\\N")
        .replace("\n", "\\N")
    )


def _escape_ffmpeg_filter_path(path: Path) -> str:
    return str(path).replace("\\", "/").replace(":", r"\:").replace("'", r"\'")


def _encoder_options(encoder: str) -> list[str]:
    if encoder == "h264_amf":
        return ["-quality", "balanced"]
    if encoder == "h264_nvenc":
        return ["-preset", "p4"]
    if encoder == "h264_qsv":
        return ["-preset", "medium"]
    return ["-preset", "medium"]
