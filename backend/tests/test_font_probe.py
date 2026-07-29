from pathlib import Path

import pytest

from app.media.font_probe import FontProbe, FontProbeError


def test_font_probe_accepts_ttf_and_otf_and_returns_metadata(tmp_path: Path) -> None:
    font = tmp_path / "袋研官标题.ttf"
    font.write_bytes(b"\x00\x01\x00\x00" + b"\0" * 32)

    result = FontProbe().probe(font)

    assert result.path == str(font)
    assert result.family == "袋研官标题"
    assert result.format == "ttf"


def test_font_probe_rejects_unknown_or_invalid_files(tmp_path: Path) -> None:
    bad = tmp_path / "font.txt"
    bad.write_text("bad")
    with pytest.raises(FontProbeError):
        FontProbe().probe(bad)
