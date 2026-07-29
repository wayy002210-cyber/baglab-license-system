from __future__ import annotations

import json
import random
import subprocess
from pathlib import Path
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field


SUPPORTED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac"}
SelectionMode = Literal["fixed", "random", "sequential"]


class AudioTrack(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    path: str
    name: str
    format: str
    duration_sec: float = Field(alias="durationSec", gt=0)
    size_bytes: int = Field(alias="sizeBytes", ge=0)


class InvalidAudio(BaseModel):
    path: str
    error: str


class AudioLibraryResult(BaseModel):
    tracks: list[AudioTrack]
    invalid: list[InvalidAudio]


class AudioProbe(Protocol):
    def probe(self, path: Path) -> AudioTrack: ...


class FfprobeAudioProbe:
    def __init__(self, executable: str = "ffprobe") -> None:
        self.executable = executable

    def probe(self, path: Path) -> AudioTrack:
        process = subprocess.run(
            [
                self.executable,
                "-v",
                "error",
                "-show_entries",
                "format=duration,format_name,size",
                "-of",
                "json",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        data = json.loads(process.stdout)["format"]
        return AudioTrack(
            path=str(path),
            name=path.stem,
            format=path.suffix.lower().removeprefix("."),
            durationSec=float(data["duration"]),
            sizeBytes=int(data.get("size") or path.stat().st_size),
        )


class AudioLibrary:
    def __init__(self, probe: AudioProbe) -> None:
        self.probe = probe
        self.cache: dict[tuple[str, int, int], AudioTrack] = {}

    def scan(self, root: Path, *, recursive: bool = True) -> AudioLibraryResult:
        if not root.is_dir():
            raise ValueError("背景音乐文件夹不存在，请重新选择")
        candidates = root.rglob("*") if recursive else root.glob("*")
        tracks: list[AudioTrack] = []
        invalid: list[InvalidAudio] = []
        for path in sorted(candidates, key=lambda item: str(item).lower()):
            if not path.is_file() or path.suffix.lower() not in SUPPORTED_AUDIO_EXTENSIONS:
                continue
            stat = path.stat()
            key = (str(path.resolve()), stat.st_size, stat.st_mtime_ns)
            try:
                track = self.cache.get(key) or self.probe.probe(path)
                self.cache[key] = track
                tracks.append(track)
            except Exception as error:
                invalid.append(InvalidAudio(path=str(path), error=str(error)))
        return AudioLibraryResult(tracks=tracks, invalid=invalid)


def select_track(
    tracks: list[AudioTrack],
    mode: SelectionMode,
    *,
    seed: int,
    cursor: int,
) -> AudioTrack:
    if not tracks:
        raise ValueError("背景音乐库中没有可播放的音频")
    if mode == "fixed":
        return tracks[0]
    if mode == "sequential":
        return tracks[cursor % len(tracks)]
    return tracks[random.Random(f"{seed}:{cursor}").randrange(len(tracks))]
