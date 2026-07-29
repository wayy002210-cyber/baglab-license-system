from __future__ import annotations

import hashlib
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel


SUPPORTED_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".webm",
    ".flv",
    ".wmv",
    ".m4v",
}


class ProbeFailure(RuntimeError):
    pass


class Probe(Protocol):
    def probe(self, path: Path) -> dict: ...


class Ffprobe:
    def __init__(self, executable: str = "ffprobe") -> None:
        self.executable = executable

    def probe(self, path: Path) -> dict:
        process = subprocess.run(
            [
                self.executable,
                "-v",
                "error",
                "-show_format",
                "-show_streams",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            check=False,
            encoding="utf-8",
            errors="replace",
            timeout=30,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if process.returncode != 0:
            message = process.stderr.strip() or "ffprobe failed"
            raise ProbeFailure(message[:500])
        try:
            return json.loads(process.stdout)
        except json.JSONDecodeError as error:
            raise ProbeFailure("ffprobe returned invalid JSON") from error


class ScannedAsset(BaseModel):
    file_name: str
    file_path: str
    duration_sec: float | None = None
    width: int | None = None
    height: int | None = None
    fps: float | None = None
    codec: str | None = None
    rotation: int = 0
    file_size: int
    fingerprint: str
    status: str
    error_message: str | None = None


class ScanResult(BaseModel):
    root_path: str
    assets: list[ScannedAsset]
    unsupported_count: int


def _parse_fps(value: object) -> float | None:
    text = str(value or "").strip()
    if not text or text == "0/0":
        return None
    try:
        if "/" in text:
            numerator, denominator = text.split("/", 1)
            return round(float(numerator) / float(denominator), 3)
        return round(float(text), 3)
    except (ValueError, ZeroDivisionError):
        return None


def _fingerprint(path: Path) -> str:
    digest = hashlib.sha256()
    size = path.stat().st_size
    with path.open("rb") as file:
        digest.update(file.read(1024 * 1024))
        if size > 1024 * 1024:
            file.seek(max(0, size - 1024 * 1024))
            digest.update(file.read(1024 * 1024))
    digest.update(str(size).encode("ascii"))
    return digest.hexdigest()


class AssetScanner:
    def __init__(self, probe: Probe) -> None:
        self.probe = probe

    def scan(self, root: Path) -> ScanResult:
        if not root.is_dir():
            raise ValueError(f"Asset folder does not exist: {root}")

        assets: list[ScannedAsset] = []
        unsupported_count = 0
        for path in sorted(root.iterdir(), key=lambda item: item.name.lower()):
            if not path.is_file():
                continue
            if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
                unsupported_count += 1
                continue
            try:
                data = self.probe.probe(path)
                video = next(
                    (
                        stream
                        for stream in data.get("streams", [])
                        if stream.get("codec_type") == "video"
                    ),
                    None,
                )
                if not video:
                    raise ProbeFailure("video stream not found")
                format_data = data.get("format", {})
                assets.append(
                    ScannedAsset(
                        file_name=path.name,
                        file_path=str(path.resolve()),
                        duration_sec=float(format_data.get("duration", 0)) or None,
                        width=video.get("width"),
                        height=video.get("height"),
                        fps=_parse_fps(video.get("avg_frame_rate")),
                        codec=video.get("codec_name"),
                        rotation=int(video.get("tags", {}).get("rotate", 0)),
                        file_size=path.stat().st_size,
                        fingerprint=_fingerprint(path),
                        status="ready",
                    )
                )
            except (ProbeFailure, OSError, ValueError) as error:
                assets.append(
                    ScannedAsset(
                        file_name=path.name,
                        file_path=str(path.resolve()),
                        file_size=path.stat().st_size,
                        fingerprint=_fingerprint(path),
                        status="invalid",
                        error_message=str(error)[:500],
                    )
                )
        return ScanResult(
            root_path=str(root.resolve()),
            assets=assets,
            unsupported_count=unsupported_count,
        )
