from pathlib import Path

from app.media.audio_library import (
    AudioLibrary,
    AudioTrack,
    select_track,
)


class Probe:
    def probe(self, path: Path) -> AudioTrack:
        if path.name == "broken.flac":
            raise ValueError("invalid audio")
        return AudioTrack(
            path=str(path),
            name=path.stem,
            format=path.suffix[1:],
            durationSec=12.5,
            sizeBytes=path.stat().st_size,
        )


def test_audio_library_scans_folders_and_keeps_flac_and_errors(tmp_path: Path) -> None:
    (tmp_path / "music.mp3").write_bytes(b"mp3")
    (tmp_path / "music.flac").write_bytes(b"flac")
    (tmp_path / "broken.flac").write_bytes(b"broken")
    nested = tmp_path / "nested"
    nested.mkdir()
    (nested / "other.wav").write_bytes(b"wav")

    flat = AudioLibrary(Probe()).scan(tmp_path, recursive=False)
    recursive = AudioLibrary(Probe()).scan(tmp_path, recursive=True)

    assert {item.format for item in flat.tracks} == {"mp3", "flac"}
    assert len(flat.invalid) == 1
    assert len(recursive.tracks) == 3
    assert recursive.invalid[0].error == "invalid audio"


def test_track_selection_is_reproducible_and_supports_modes() -> None:
    tracks = [
        AudioTrack(path=f"{item}.mp3", name=str(item), format="mp3",
                   durationSec=10, sizeBytes=1)
        for item in range(3)
    ]

    assert select_track(tracks, "fixed", seed=9, cursor=2) == tracks[0]
    assert select_track(tracks, "sequential", seed=9, cursor=4) == tracks[1]
    assert select_track(tracks, "random", seed=9, cursor=4) == select_track(
        tracks, "random", seed=9, cursor=4
    )
