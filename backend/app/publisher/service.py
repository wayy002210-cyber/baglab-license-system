from __future__ import annotations

from typing import Literal

from app.publisher.adapters import (
    DouyinPublisher,
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
    def check_account(
        self, *, platform: Platform, user_data_dir: str
    ) -> str:
        with PersistentBrowserSession(user_data_dir) as page:
            page.page.goto(UPLOAD_URLS[platform], wait_until="domcontentloaded")
            page.page.wait_for_timeout(2_000)
            if page.has_human_challenge():
                return "needs_user"
            return "expired" if page.is_login_required() else "connected"

    def publish(
        self,
        *,
        platform: Platform,
        user_data_dir: str,
        request: PublishRequest,
    ) -> PublishResult:
        adapter = (
            DouyinPublisher()
            if platform == "douyin"
            else XiaohongshuPublisher()
        )
        with PersistentBrowserSession(user_data_dir) as page:
            page.page.goto(UPLOAD_URLS[platform], wait_until="domcontentloaded")
            page.page.wait_for_timeout(2_000)
            return adapter.publish(page, request)
