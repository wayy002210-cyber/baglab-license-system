import json
from pathlib import Path

from app.main import BACKEND_BUILD_ID


def test_backend_build_id_matches_desktop_package_version() -> None:
    project_root = Path(__file__).resolve().parents[2]
    package = json.loads((project_root / "package.json").read_text(encoding="utf-8"))

    assert BACKEND_BUILD_ID == package["version"]
