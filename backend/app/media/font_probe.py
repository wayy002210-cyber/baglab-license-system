from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel


class FontProbeError(ValueError):
    pass


class FontMetadata(BaseModel):
    path: str
    family: str
    format: str


class FontProbe:
    def probe(self, path: Path) -> FontMetadata:
        if not path.is_file():
            raise FontProbeError("字体文件不存在，请重新选择")
        suffix = path.suffix.lower()
        if suffix not in {".ttf", ".otf", ".ttc", ".otc", ".fon", ".fnt"}:
            raise FontProbeError("支持 TTF、OTF、TTC、OTC、FON 和 FNT 字体文件")
        signature = path.read_bytes()[:4]
        valid = {
            ".ttf": signature in {b"\x00\x01\x00\x00", b"true"},
            ".otf": signature == b"OTTO",
            ".ttc": signature == b"ttcf",
            ".otc": signature == b"ttcf",
            ".fon": signature[:2] in {b"MZ", b"NE"},
            ".fnt": signature[:2] in {b"\x00\x02", b"\x00\x03"},
        }[suffix]
        if not valid:
            raise FontProbeError("字体文件无法识别或已经损坏")
        return FontMetadata(
            path=str(path), family=path.stem, format=suffix.removeprefix(".")
        )
