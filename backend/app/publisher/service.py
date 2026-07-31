from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from threading import Lock
from time import monotonic
from typing import Callable, ContextManager, Literal

from app.publisher.adapters import (
    DouyinPublisher,
    PublishCancellation,
    PublishCancelled,
    PublishRequest,
    PublishResult,
    WechatChannelsPublisher,
)
from app.publisher.playwright_page import PersistentBrowserSession


Platform = Literal["douyin", "wechat_channels"]
UPLOAD_URLS: dict[Platform, str] = {
    "douyin": "https://creator.douyin.com/creator-micro/content/upload",
    "wechat_channels": "https://channels.weixin.qq.com/platform/post/create",
}


class PublishingService:
    def __init__(
        self,
        session_factory: Callable[
            [str], ContextManager
        ] = PersistentBrowserSession,
        media_validator: Callable[[str], bool] | None = None,
    ) -> None:
        self.session_factory = session_factory
        self.media_validator = media_validator or self._validate_media
        self._lock = Lock()
        self._cancellations: dict[str, PublishCancellation] = {}

    def check_account(
        self, *, platform: Platform, user_data_dir: str
    ) -> str:
        with self.session_factory(user_data_dir) as page:
            page.page.goto(UPLOAD_URLS[platform], wait_until="domcontentloaded")
            page.page.wait_for_timeout(2_000)
            if page.has_human_challenge():
                return "needs_user"
            return "expired" if page.is_login_required() else "connected"

    def connect_account(
        self,
        *,
        platform: Platform,
        user_data_dir: str,
        max_wait_ms: int = 180_000,
        poll_interval_ms: int = 1_500,
    ) -> str:
        """Keep the visible login window alive while the user scans or signs in."""
        with self.session_factory(user_data_dir) as page:
            page.page.goto(UPLOAD_URLS[platform], wait_until="domcontentloaded")
            deadline = monotonic() + max_wait_ms / 1000
            saw_challenge = False
            while monotonic() < deadline:
                page.page.wait_for_timeout(poll_interval_ms)
                saw_challenge = saw_challenge or page.has_human_challenge()
                if not page.is_login_required() and not page.has_human_challenge():
                    return "connected"
            return "needs_user" if saw_challenge else "expired"

    def publish(
        self,
        *,
        job_id: str,
        platform: Platform,
        user_data_dir: str,
        request: PublishRequest,
    ) -> PublishResult:
        with self._lock:
            cancellation = self._cancellations.setdefault(
                job_id, PublishCancellation()
            )
        try:
            cancellation.raise_if_canceled()
        except PublishCancelled as error:
            with self._lock:
                self._cancellations.pop(job_id, None)
            return PublishResult(
                status="canceled",
                errorCode="PUBLISH_CANCELED",
                errorMessage=str(error),
            )
        if not self.media_validator(request.video_path):
            with self._lock:
                self._cancellations.pop(job_id, None)
            return PublishResult(
                status="failed",
                errorCode="INVALID_VIDEO",
                errorMessage="成片文件无法播放或尚未完整写入，请重新生成后再发布。",
            )
        adapter = (
            DouyinPublisher()
            if platform == "douyin"
            else WechatChannelsPublisher()
        )
        try:
            with self.session_factory(user_data_dir) as page:
                cancellation.raise_if_canceled()
                page.page.goto(UPLOAD_URLS[platform], wait_until="domcontentloaded")
                page.page.wait_for_timeout(2_000)
                result = adapter.publish(
                    page,
                    request,
                    cancellation=cancellation,
                )
                if result.status == "needs_user":
                    page.page.wait_for_timeout(180_000)
                return result
        except PublishCancelled as error:
            return PublishResult(
                status="canceled",
                errorCode="PUBLISH_CANCELED",
                errorMessage=str(error),
            )
        finally:
            with self._lock:
                self._cancellations.pop(job_id, None)

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            cancellation = self._cancellations.setdefault(
                job_id, PublishCancellation()
            )
            return cancellation.cancel()

    @staticmethod
    def _validate_media(path: str) -> bool:
        media_path = Path(path)
        if not media_path.is_file() or media_path.stat().st_size == 0:
            return False
        ffprobe = os.environ.get("AUTOCUT_FFPROBE", "ffprobe")
        try:
            result = subprocess.run(
                [
                    ffprobe, "-v", "error", "-select_streams", "v:0",
                    "-show_entries", "stream=codec_name",
                    "-show_entries", "format=duration", "-of", "json", path,
                ],
                capture_output=True,
                text=True,
                timeout=20,
                check=True,
            )
            payload = json.loads(result.stdout)
            duration = float(payload.get("format", {}).get("duration", 0))
            return bool(payload.get("streams")) and duration > 0
        except (OSError, ValueError, subprocess.SubprocessError, json.JSONDecodeError):
            return False
