from __future__ import annotations

import atexit
import os
import sys
from pathlib import Path
from typing import TextIO


class BackendAlreadyRunningError(RuntimeError):
    def __init__(self, lock_path: Path) -> None:
        super().__init__(f"后端单实例锁已被占用：{lock_path}")
        self.lock_path = lock_path


_lock_file: TextIO | None = None
_lock_path: Path | None = None


def _default_lock_path() -> Path:
    configured = os.environ.get("AUTOCUT_BACKEND_LOCK_FILE", "").strip()
    if configured:
        return Path(configured)
    work_dir = os.environ.get("AUTOCUT_WORK_DIRECTORY", "").strip()
    root = Path(work_dir) if work_dir else Path.cwd()
    return root / "autocut-backend.lock"


def acquire_backend_lock(lock_path: str | Path | None = None) -> Path:
    """Acquire an OS-level non-blocking lock for the local backend process."""

    global _lock_file, _lock_path
    if _lock_file and _lock_path:
        return _lock_path

    path = Path(lock_path) if lock_path is not None else _default_lock_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open("a+", encoding="utf-8")

    try:
        if os.name == "nt":
            import msvcrt

            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as error:
        handle.close()
        raise BackendAlreadyRunningError(path) from error

    handle.seek(0)
    handle.truncate()
    handle.write(
        f"pid={os.getpid()}\n"
        f"build_id={os.environ.get('AUTOCUT_BUILD_ID', 'unknown')}\n"
        f"install_root={os.environ.get('AUTOCUT_INSTALL_ROOT', '')}\n"
    )
    handle.flush()
    _lock_file = handle
    _lock_path = path
    atexit.register(release_backend_lock)
    return path


def release_backend_lock() -> None:
    global _lock_file, _lock_path
    if not _lock_file:
        return
    try:
        if os.name == "nt":
            import msvcrt

            _lock_file.seek(0)
            msvcrt.locking(_lock_file.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(_lock_file.fileno(), fcntl.LOCK_UN)
    finally:
        _lock_file.close()
        _lock_file = None
        _lock_path = None


def exit_if_backend_lock_is_taken(lock_path: str | Path | None = None) -> Path:
    try:
        return acquire_backend_lock(lock_path)
    except BackendAlreadyRunningError as error:
        print(
            f"本地后端已有实例正在运行，第二个后端已退出。锁文件：{error.lock_path}",
            file=sys.stderr,
            flush=True,
        )
        raise SystemExit(72) from error
