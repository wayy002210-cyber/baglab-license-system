import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.timeline.exporter import (
    AudioClip,
    Exporter,
    Project,
    SubtitleClip,
    VideoClip,
)


pytestmark = pytest.mark.skipif(
    not shutil.which("ffmpeg") or not shutil.which("ffprobe"),
    reason="FFmpeg toolchain is unavailable",
)


def run(command: list[str]) -> None:
    subprocess.run(command, check=True, capture_output=True)


def test_real_export_produces_vertical_h264_aac_video(tmp_path: Path) -> None:
    video_a = tmp_path / "a.mp4"
    video_b = tmp_path / "b.mp4"
    voice = tmp_path / "voice.wav"
    bgm = tmp_path / "bgm.wav"
    output = tmp_path / "final.mp4"

    run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=180x320:d=1:r=30",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(video_a),
        ]
    )
    run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=red:s=320x180:d=0.5:r=30",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(video_b),
        ]
    )
    for path, frequency in ((voice, 660), (bgm, 220)):
        run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                f"sine=frequency={frequency}:duration=2",
                str(path),
            ]
        )

    project = Project(
        output_path=output,
        video_clips=[
            VideoClip(video_a, start_sec=0, duration_sec=1),
            VideoClip(
                video_b,
                start_sec=0,
                duration_sec=1,
                loop=True,
                source_duration_sec=0.5,
            ),
        ],
        voice_clips=[AudioClip(voice, start_sec=0)],
        subtitles=[SubtitleClip(0, 1.8, "真实合成测试")],
        bgm_path=bgm,
        bgm_duration_sec=2,
    )
    Exporter().export(project, encoder="libx264")

    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_streams",
            "-of",
            "json",
            str(output),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    streams = json.loads(probe.stdout)["streams"]
    video = next(stream for stream in streams if stream["codec_type"] == "video")
    audio = next(stream for stream in streams if stream["codec_type"] == "audio")

    assert (video["width"], video["height"]) == (1080, 1920)
    assert video["codec_name"] == "h264"
    assert video["r_frame_rate"] == "30/1"
    assert audio["codec_name"] == "aac"


def test_ten_consecutive_exports_complete_successfully(tmp_path: Path) -> None:
    video = tmp_path / "source.mp4"
    voice = tmp_path / "voice.wav"
    run([
        "ffmpeg", "-y", "-f", "lavfi", "-i",
        "color=c=green:s=180x320:d=0.5:r=30",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video)
    ])
    run([
        "ffmpeg", "-y", "-f", "lavfi", "-i",
        "sine=frequency=440:duration=0.5", str(voice)
    ])

    outputs = []
    for index in range(10):
        output = tmp_path / f"batch-{index}.mp4"
        Exporter().export(
            Project(
                output_path=output,
                video_clips=[VideoClip(video, 0, 0.3)],
                voice_clips=[AudioClip(voice, 0)],
                subtitles=[SubtitleClip(0, 0.3, f"批量任务 {index}")],
            ),
            encoder="libx264",
        )
        outputs.append(output)

    assert len([path for path in outputs if path.stat().st_size > 0]) == 10
