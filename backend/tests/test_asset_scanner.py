from pathlib import Path

from app.media.asset_scanner import AssetScanner, ProbeFailure


class FixtureProbe:
    def probe(self, path: Path) -> dict:
        if path.name == "broken.mp4":
            raise ProbeFailure("invalid media")
        return {
            "format": {"duration": "4.25", "size": "2048"},
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 1080,
                    "height": 1920,
                    "avg_frame_rate": "30/1",
                    "tags": {"rotate": "90" if path.name == "rotate.mov" else "0"},
                }
            ],
        }


class FixtureThumbnailer:
    def __init__(self) -> None:
        self.calls: list[tuple[Path, str]] = []

    def create(self, path: Path, fingerprint: str) -> Path:
        self.calls.append((path, fingerprint))
        thumbnail = path.parent / f"{fingerprint}.jpg"
        thumbnail.write_bytes(b"jpg")
        return thumbnail


class BrokenThumbnailer:
    def create(self, path: Path, fingerprint: str) -> Path:
        raise ProbeFailure("thumbnail failed")


def test_scan_generates_a_cached_thumbnail_for_ready_video(tmp_path: Path) -> None:
    video = tmp_path / "one.mp4"
    video.write_bytes(b"video")
    thumbnailer = FixtureThumbnailer()

    result = AssetScanner(FixtureProbe(), thumbnailer=thumbnailer).scan(tmp_path)

    assert len(thumbnailer.calls) == 1
    assert result.assets[0].thumbnail_path is not None
    assert Path(result.assets[0].thumbnail_path).read_bytes() == b"jpg"


def test_thumbnail_failure_does_not_invalidate_a_readable_video(tmp_path: Path) -> None:
    (tmp_path / "one.mp4").write_bytes(b"video")

    result = AssetScanner(FixtureProbe(), thumbnailer=BrokenThumbnailer()).scan(tmp_path)

    assert result.assets[0].status == "ready"
    assert result.assets[0].thumbnail_path is None


def test_scan_returns_normalized_metadata_and_ignores_unsupported_files(
    tmp_path: Path,
) -> None:
    (tmp_path / "one.mp4").write_bytes(b"video")
    (tmp_path / "rotate.mov").write_bytes(b"video")
    (tmp_path / "notes.txt").write_text("ignore", encoding="utf-8")

    result = AssetScanner(FixtureProbe()).scan(tmp_path)

    assert [item.file_name for item in result.assets] == ["one.mp4", "rotate.mov"]
    assert result.assets[0].duration_sec == 4.25
    assert result.assets[0].fps == 30.0
    assert result.assets[1].rotation == 90
    assert result.unsupported_count == 1


def test_scan_isolates_a_broken_video_without_aborting_the_category(
    tmp_path: Path,
) -> None:
    (tmp_path / "good.mp4").write_bytes(b"video")
    (tmp_path / "broken.mp4").write_bytes(b"bad")

    result = AssetScanner(FixtureProbe()).scan(tmp_path)

    by_name = {item.file_name: item for item in result.assets}
    assert by_name["good.mp4"].status == "ready"
    assert by_name["broken.mp4"].status == "invalid"
    assert by_name["broken.mp4"].error_message == "invalid media"
