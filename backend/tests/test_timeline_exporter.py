from pathlib import Path
import io
import subprocess
import threading
import pytest

from app.timeline.exporter import (
    AudioClip,
    EncoderDetector,
    Exporter,
    Project,
    SubtitleClip,
    VideoClip,
    write_ass_subtitles,
    ExportCanceledError,
    TextStyle,
    TitleClip,
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


def test_export_command_accepts_flac_bgm_and_keeps_aac_output(tmp_path: Path) -> None:
    project = sample_project(tmp_path)
    project = Project(
        **{**project.__dict__, "bgm_path": tmp_path / "music.flac"}
    )
    command = Exporter(ffmpeg="ffmpeg").build_command(project)

    assert str(tmp_path / "music.flac") in command
    assert command[command.index("-c:a") + 1] == "aac"


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


def test_ass_writer_supports_independent_title_and_subtitle_styles(
    tmp_path: Path,
) -> None:
    output = tmp_path / "styled.ass"
    write_ass_subtitles(
        output,
        [SubtitleClip(start_sec=0, end_sec=2, text="正文字幕")],
        titles=[TitleClip(start_sec=0, end_sec=1.5, text="顶部标题")],
        subtitle_style=TextStyle(
            font_family="Microsoft YaHei",
            font_size=66,
            primary_color="#FFFFFF",
            outline_color="#000000",
            outline_width=5,
            shadow_color="#66000000",
            shadow_x=2,
            shadow_y=3,
            alignment=2,
            margin_v=180,
        ),
        title_style=TextStyle(
            font_family="Microsoft YaHei",
            font_size=82,
            primary_color="#FFE600",
            outline_color="#111111",
            outline_width=3,
            shadow_color="#66000000",
            shadow_x=1,
            shadow_y=2,
            alignment=8,
            margin_v=120,
        ),
    )
    content = output.read_text(encoding="utf-8")
    assert "Style: Subtitle,Microsoft YaHei,66" in content
    assert "Style: Title,Microsoft YaHei,82" in content
    assert "Dialogue: 1,0:00:00.00,0:00:01.50,Title,顶部标题" in content


def test_encoder_detector_prefers_available_hardware_in_priority_order() -> None:
    detector = EncoderDetector()

    assert detector.choose(" V..... h264_amf\n V..... h264_qsv\n") == "h264_amf"
    assert detector.choose(" V..... h264_amf\n") == "h264_amf"
    assert detector.choose(" V..... libx264\n") == "libx264"


def test_encoder_detector_skips_compiled_encoder_that_cannot_encode() -> None:
    probed: list[str] = []

    def runner(command, **kwargs):
        if "-encoders" in command:
            return subprocess.CompletedProcess(
                command,
                0,
                stdout=" V..... h264_amf\n V..... h264_nvenc\n",
                stderr="",
            )
        encoder = command[command.index("-c:v") + 1]
        probed.append(encoder)
        return subprocess.CompletedProcess(
            command,
            1 if encoder == "h264_amf" else 0,
            stdout="",
            stderr="device unavailable" if encoder == "h264_amf" else "",
        )

    assert EncoderDetector(runner=runner).detect() == "h264_nvenc"
    assert probed == ["h264_amf", "h264_nvenc"]


def test_amf_export_uses_amf_quality_option_instead_of_nvenc_preset(
    tmp_path: Path,
) -> None:
    command = Exporter().build_command(sample_project(tmp_path), encoder="h264_amf")

    assert "-quality" in command
    assert "balanced" in command
    assert "p4" not in command


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
        if "lavfi" in command:
            return subprocess.CompletedProcess(command, 0, stdout="", stderr="")
        if "h264_nvenc" in command:
            raise subprocess.CalledProcessError(1, command, stderr="no device")
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

    project = Project(
        output_path=tmp_path / "out.mp4",
        video_clips=[VideoClip(tmp_path / "a.mp4", 0, 1)],
    )
    Exporter(runner=runner).export(project)

    export_commands = [
        command
        for command in commands
        if "-encoders" not in command and "lavfi" not in command
    ]
    assert "h264_nvenc" in export_commands[0]
    assert "libx264" in export_commands[1]


def test_export_terminates_ffmpeg_when_cancel_signal_is_set(tmp_path: Path) -> None:
    class Process:
        returncode = None
        terminated = False

        def poll(self): return self.returncode
        def terminate(self): self.terminated = True; self.returncode = 1
        def kill(self): self.returncode = 1
        def wait(self, timeout=None): return self.returncode
        def communicate(self, timeout=None): return ("", "canceled")

    process = Process()
    exporter = Exporter(process_factory=lambda *args, **kwargs: process)
    canceled = threading.Event()
    canceled.set()
    project = Project(
        output_path=tmp_path / "out.mp4",
        video_clips=[VideoClip(tmp_path / "a.mp4", 0, 1)],
    )

    with pytest.raises(ExportCanceledError):
        exporter.export(project, encoder="libx264", cancel_event=canceled)

    assert process.terminated is True


def test_export_reports_monotonic_ffmpeg_progress(tmp_path: Path) -> None:
    class Process:
        returncode = 0
        stdout = io.StringIO(
            "out_time_ms=1000000\nprogress=continue\n"
            "out_time_ms=3000000\nprogress=end\n"
        )
        stderr = io.StringIO("")

        def poll(self): return self.returncode
        def terminate(self): self.returncode = 1
        def kill(self): self.returncode = 1
        def wait(self, timeout=None): return self.returncode

    progress: list[float] = []
    project = Project(
        output_path=tmp_path / "out.mp4",
        video_clips=[VideoClip(tmp_path / "a.mp4", 0, 3)],
    )

    Exporter(process_factory=lambda *args, **kwargs: Process()).export(
        project,
        encoder="libx264",
        cancel_event=threading.Event(),
        on_progress=progress.append,
    )

    assert progress[0] == pytest.approx(1 / 3)
    assert progress[-1] == 1.0
    assert progress == sorted(progress)


def test_export_command_enables_machine_readable_progress(tmp_path: Path) -> None:
    command = Exporter().build_command(sample_project(tmp_path))

    assert command[1:4] == ["-hide_banner", "-nostats", "-progress"]
    assert command[4] == "pipe:1"
