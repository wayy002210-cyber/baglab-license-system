from pathlib import Path
import subprocess

from app.timeline.exporter import (
    AudioClip,
    EncoderDetector,
    Exporter,
    Project,
    SubtitleClip,
    VideoClip,
    write_ass_subtitles,
)


def sample_project(tmp_path: Path) -> Project:
    return Project(
        output_path=tmp_path / "final.mp4",
        video_clips=[
            VideoClip(
                path=tmp_path / "one.mp4",
                start_sec=1.5,
                duration_sec=3.0,
                loop=False,
            ),
            VideoClip(
                path=tmp_path / "two.mp4",
                start_sec=0,
                duration_sec=2.0,
                loop=True,
            ),
        ],
        voice_clips=[
            AudioClip(path=tmp_path / "voice-1.mp3", start_sec=0, volume=1.0),
            AudioClip(path=tmp_path / "voice-2.mp3", start_sec=3, volume=1.0),
        ],
        subtitles=[
            SubtitleClip(start_sec=0, end_sec=3, text="第一句"),
            SubtitleClip(start_sec=3, end_sec=5, text="第二句"),
        ],
        bgm_path=tmp_path / "bgm.mp3",
    )


def test_export_command_normalizes_portrait_video_and_mixes_audio(tmp_path: Path) -> None:
    command = Exporter(ffmpeg="ffmpeg").build_command(
        sample_project(tmp_path), encoder="libx264"
    )
    joined = " ".join(command)

    assert "scale=1080:1920:force_original_aspect_ratio=increase" in joined
    assert "crop=1080:1920" in joined
    assert "fps=30" in joined
    assert "concat=n=2:v=1:a=0" in joined
    assert "amix=inputs=3" in joined
    assert "-c:v libx264" in joined
    assert "-c:a aac" in joined
    assert "-movflags +faststart" in joined


def test_export_command_loops_short_video_and_bgm(tmp_path: Path) -> None:
    command = Exporter(ffmpeg="ffmpeg").build_command(sample_project(tmp_path))

    assert command.count("-stream_loop") == 2
    assert str(tmp_path / "two.mp4") in command
    assert str(tmp_path / "bgm.mp3") in command


def test_ass_writer_escapes_user_text_and_uses_portrait_canvas(tmp_path: Path) -> None:
    output = tmp_path / "captions.ass"
    write_ass_subtitles(
        output,
        [SubtitleClip(start_sec=1.25, end_sec=3.5, text=r"价格{透明}\下一行")],
    )

    content = output.read_text(encoding="utf-8")
    assert "PlayResX: 1080" in content
    assert "PlayResY: 1920" in content
    assert r"价格\{透明\}\\下一行" in content
    assert "0:00:01.25,0:00:03.50" in content


def test_encoder_detector_prefers_available_hardware_in_priority_order() -> None:
    detector = EncoderDetector()

    assert detector.choose(" V..... h264_amf\n V..... h264_qsv\n") == "h264_qsv"
    assert detector.choose(" V..... h264_amf\n") == "h264_amf"
    assert detector.choose(" V..... libx264\n") == "libx264"


def test_export_retries_with_libx264_when_hardware_encoder_fails(
    tmp_path: Path,
) -> None:
    commands: list[list[str]] = []

    def runner(command, **kwargs):
        commands.append(command)
        if "-encoders" in command:
            return subprocess.CompletedProcess(
                command, 0, stdout=" V..... h264_nvenc", stderr=""
            )
        if "h264_nvenc" in command:
            raise subprocess.CalledProcessError(1, command, stderr="no device")
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

    project = Project(
        output_path=tmp_path / "out.mp4",
        video_clips=[VideoClip(tmp_path / "a.mp4", 0, 1)],
    )
    Exporter(runner=runner).export(project)

    export_commands = [command for command in commands if "-encoders" not in command]
    assert "h264_nvenc" in export_commands[0]
    assert "libx264" in export_commands[1]
