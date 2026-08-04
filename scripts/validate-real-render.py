from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app.timeline.exporter import (
    AudioClip,
    Exporter,
    Project,
    SubtitleClip,
    TextStyle,
    TitleClip,
    VideoClip,
)


SOURCE = Path(r"D:\acceptance-real-0.5.3.mp4")
OUTPUT = Path(r"D:\acceptance-品牌避坑指南.mp4")
WORK = Path(r"D:\acceptance-work\semantic-subtitle")
FFMPEG = ROOT / "build-resources" / "bin" / "ffmpeg.exe"
FFPROBE = ROOT / "build-resources" / "bin" / "ffprobe.exe"


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"缺少验收源视频：{SOURCE}")
    project = Project(
        output_path=OUTPUT,
        work_dir=WORK,
        video_clips=[VideoClip(SOURCE, 0, 6)],
        voice_clips=[AudioClip(SOURCE, 0, 1.0)],
        subtitles=[SubtitleClip(0, 6, "每个袋子必须让使用者愿意背，这才是客户品牌曝光的核心，还要兼顾质量和传播。")],
        titles=[TitleClip(0, 6, "品牌避坑指南")],
        subtitle_style=TextStyle(font_size=80, outline_width=6, position_x=540, position_y=1580),
        title_style=TextStyle(font_size=92, primary_color="#FFE600", outline_width=4, alignment=8, position_x=540, position_y=180),
        video_bitrate_mbps=4,
    )
    Exporter(ffmpeg=str(FFMPEG)).export(project, encoder="libx264")
    result = subprocess.run(
        [str(FFPROBE), "-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration,size", "-of", "json", str(OUTPUT)],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    streams = payload["streams"]
    video = next(item for item in streams if item["codec_type"] == "video")
    audio = next(item for item in streams if item["codec_type"] == "audio")
    assert (video["width"], video["height"], video["codec_name"]) == (1080, 1920, "h264")
    assert audio["codec_name"] == "aac"
    assert 5.9 <= float(payload["format"]["duration"]) <= 6.1
    assert not list(OUTPUT.parent.glob(f"{OUTPUT.stem}*.ass"))
    print(json.dumps({"output": str(OUTPUT), "video": video, "audio": audio, "format": payload["format"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
