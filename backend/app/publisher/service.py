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
    KuaishouPublisher,
    PublishCancellation,
    PublishCancelled,
    PublishRequest,
    PublishResult,
    WechatChannelsPublisher,
)
from app.publisher.playwright_page import PersistentBrowserSession
from app.publisher.agent import BrowserAgentManager


Platform = Literal["douyin", "wechat_channels", "kuaishou"]
UPLOAD_URLS: dict[Platform, str] = {
    "douyin": "https://creator.douyin.com/creator-micro/content/upload",
    "wechat_channels": "https://channels.weixin.qq.com/platform/post/create",
    "kuaishou": "https://cp.kuaishou.com/article/publish/video",
}


class AccountBrowserError(RuntimeError):
    """A safe, actionable error exposed by the account browser endpoints."""


def _account_browser_error(action: str, error: Exception) -> AccountBrowserError:
    detail = str(error)
    normalized = detail.lower()
    if any(token in normalized for token in ("processsingleton", "user data directory", "profile is already in use", "singletonlock")):
        return AccountBrowserError("该账号的登录浏览器正在使用中。请先关闭该账号打开的浏览器窗口，再重试。")
    if any(token in normalized for token in ("executable doesn't exist", "browser executable", "playwright")):
        return AccountBrowserError("本地浏览器组件不可用。请关闭软件后使用最新安装包覆盖安装，再重新打开软件。")
    if "timeout" in normalized:
        return AccountBrowserError(f"{action}超时：平台页面响应较慢，请检查网络后重试。")
    return AccountBrowserError(f"{action}失败：{detail[:240] or '浏览器组件返回未知错误'}")


class PublishingService:
    def __init__(
        self,
        session_factory: Callable[[str], ContextManager] = PersistentBrowserSession,
        media_validator: Callable[[str], bool] | None = None,
    ) -> None:
        self.session_factory = session_factory
        self.media_validator = media_validator or self._validate_media
        self._lock = Lock()
        self._cancellations: dict[str, PublishCancellation] = {}
        self.agent = BrowserAgentManager(self.media_validator)

    def start_agent(
        self, *, job_id: str, platform: Platform, user_data_dir: str, request: PublishRequest
    ) -> dict:
        return self.agent.start(
            job_id=job_id,
            platform=platform,
            user_data_dir=user_data_dir,
            request=request,
        )

    def resume_agent(self, job_id: str) -> dict:
        return self.agent.resume(job_id)

    def get_agent(self, job_id: str) -> dict | None:
        return self.agent.get(job_id)

    def check_account(self, *, platform: Platform, user_data_dir: str) -> str:
        # Account checks are intentionally silent; only explicit login opens a
        # visible browser window. Test factories remain fully supported.
        try:
            session = PersistentBrowserSession(user_data_dir, headless=True) if self.session_factory is PersistentBrowserSession else self.session_factory(user_data_dir)
            with session as page:
                page.page.goto(UPLOAD_URLS[platform], wait_until="domcontentloaded")
                page.page.wait_for_timeout(2_000)
                if page.has_human_challenge():
                    return "needs_user"
                return "expired" if page.is_login_required() else "connected"
        except Exception as error:
            raise _account_browser_error("账号状态检测", error) from error

    def connect_account(
        self,
        *,
        platform: Platform,
        user_data_dir: str,
        max_wait_ms: int = 180_000,
        poll_interval_ms: int = 1_500,
    ) -> str:
        try:
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
        except Exception as error:
            raise _account_browser_error("登录窗口打开", error) from error

    def publish(
        self,
        *,
        job_id: str,
        platform: Platform,
        user_data_dir: str,
        request: PublishRequest,
    ) -> PublishResult:
        with self._lock:
            cancellation = self._cancellations.setdefault(job_id, PublishCancellation())
        try:
            cancellation.raise_if_canceled()
            if not self.media_validator(request.video_path):
                return PublishResult(
                    status="failed",
                    errorCode="INVALID_VIDEO",
                    errorMessage="成片文件无法播放或尚未完整写入，请重新生成后再发布。",
                )
            adapter = {
                "douyin": DouyinPublisher(),
                "wechat_channels": WechatChannelsPublisher(),
                "kuaishou": KuaishouPublisher(),
            }[platform]
            with self.session_factory(user_data_dir) as page:
                cancellation.raise_if_canceled()
                page.page.goto(UPLOAD_URLS[platform], wait_until="domcontentloaded")
                page.page.wait_for_timeout(2_000)
                login_result = self._wait_for_user_login(page, cancellation)
                if login_result is not None:
                    return login_result
                result = adapter.publish(page, request, cancellation=cancellation)
                if result.status != "needs_user":
                    return result
                deadline = monotonic() + 300
                while monotonic() < deadline and (
                    page.has_human_challenge() or page.is_login_required()
                ):
                    cancellation.raise_if_canceled()
                    page.page.wait_for_timeout(1_500)
                if (
                    not page.has_human_challenge()
                    and not page.is_login_required()
                    and page.wait_for_publish_success()
                ):
                    return PublishResult(status="published", currentUrl=page.url)
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

    @staticmethod
    def _wait_for_user_login(page, cancellation: PublishCancellation) -> PublishResult | None:
        if not page.is_login_required() and not page.has_human_challenge():
            return None
        deadline = monotonic() + 300
        while monotonic() < deadline and (
            page.is_login_required() or page.has_human_challenge()
        ):
            cancellation.raise_if_canceled()
            page.page.wait_for_timeout(1_500)
        if not page.is_login_required() and not page.has_human_challenge():
            return None
        return PublishResult(
            status="needs_user",
            errorCode="LOGIN_OR_VERIFICATION_REQUIRED",
            errorMessage="登录或验证码验证尚未完成，请重新执行发布任务。",
            currentUrl=page.url,
        )

    def cancel(self, job_id: str) -> bool:
        self.agent.cancel(job_id)
        with self._lock:
            cancellation = self._cancellations.setdefault(job_id, PublishCancellation())
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
                    ffprobe,
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_entries",
                    "stream=codec_name",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "json",
                    path,
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
