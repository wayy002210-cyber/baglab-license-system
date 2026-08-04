from pathlib import Path

import pytest

from app.media.font_probe import FontProbe, FontProbeError


@pytest.mark.parametrize(
    ("name", "signature"),
    [("a.ttf", b"\x00\x01\x00\x00"), ("a.otf", b"OTTO"), ("a.ttc", b"ttcf"), ("a.otc", b"ttcf"), ("a.fon", b"MZxx"), ("a.fnt", b"\x00\x03xx")],
)
def test_probes_supported_font_formats(tmp_path: Path, name: str, signature: bytes):
    path = tmp_path / name
    path.write_bytes(signature + b"font")
    assert FontProbe().probe(path).format == path.suffix[1:]


def test_rejects_damaged_font(tmp_path: Path):
    path = tmp_path / "bad.ttc"
    path.write_bytes(b"bad!")
    with pytest.raises(FontProbeError, match="损坏"):
        FontProbe().probe(path)
