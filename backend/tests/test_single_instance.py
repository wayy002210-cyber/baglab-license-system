from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from app.single_instance import acquire_backend_lock, release_backend_lock


def test_second_backend_instance_exits_with_clear_reason(tmp_path) -> None:
    lock_path = tmp_path / "autocut-backend.lock"
    acquire_backend_lock(lock_path)
    try:
        env = {
            **os.environ,
            "AUTOCUT_BACKEND_LOCK_FILE": str(lock_path),
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUTF8": "1",
        }
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                "from app.single_instance import exit_if_backend_lock_is_taken; exit_if_backend_lock_is_taken()",
            ],
            cwd=Path(__file__).resolve().parents[1],
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=10,
        )
    finally:
        release_backend_lock()

    assert result.returncode == 72
    assert "第二个后端已退出" in result.stderr
    assert str(lock_path) in result.stderr
