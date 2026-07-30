from __future__ import annotations

from threading import Lock
from time import monotonic
from typing import Callable, ContextManager, Literal

from app.publisher.adapters import (
    DouyinPublisher,
    PublishCancellation,
    PublishCancelled,
    PublishRequest,
    PublishResult,
    XiaohongshuPublisher,
)
from app.publisher.playwright_page import PersistentBrowserSession


Platform = Literal["douyin", "xiaohongshu"]
UPLOAD_URLS: dict[Platform, str] = {
    "douyin": "https://creator.douyin.com/creator-micro/content/upload",
    "xiaohongshu": "https://creator.xiaohongshu.com/publish/publish",
}


class PublishingService:
    def __init__(
        self,
        session_factory: Callable[
            [str], ContextManager
        ] = PersistentBrowserSession,
    ) -> None:
        self.session_factory = session_factory
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
        adapter = (
            DouyinPublisher()
            if platform == "douyin"
            else XiaohongshuPublisher()
        )
        with self._lock:
            cancellation = self._cancellations.setdefault(
                job_id, PublishCancellation()
            )
        try:
            with self.session_factory(user_data_dir) as page:
                cancellation.raise_if_canceled()
                page.page.goto(UPLOAD_URLS[platform], wait_until="domcontentloaded")
                page.page.wait_for_timeout(2_000)
                return adapter.publish(
                    page,
                    request,
                    cancellation=cancellation,
                )
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
