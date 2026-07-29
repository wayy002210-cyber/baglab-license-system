from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field


class PublishRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    video_path: str = Field(alias="videoPath")
    title: str = Field(min_length=1)
    topics: list[str] = Field(default_factory=list)
    cover_path: str | None = Field(default=None, alias="coverPath")
    screenshot_dir: str = Field(alias="screenshotDir")


class PublishResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    status: Literal["published", "failed", "needs_user", "canceled"]
    error_code: str | None = Field(default=None, alias="errorCode")
    error_message: str | None = Field(default=None, alias="errorMessage")
    screenshot_path: str | None = Field(default=None, alias="screenshotPath")
    current_url: str | None = Field(default=None, alias="currentUrl")


class PublisherPage(Protocol):
    @property
    def url(self) -> str: ...
    def is_login_required(self) -> bool: ...
    def has_human_challenge(self) -> bool: ...
    def upload(self, selectors: list[str], path: str) -> None: ...
    def fill(self, selectors: list[str], value: str) -> None: ...
    def click(self, selectors: list[str]) -> None: ...
    def wait_for_publish_success(self) -> bool: ...
    def screenshot(self, path: str) -> None: ...


class PublishCancelled(RuntimeError):
    pass


class PublishCancellation:
    def __init__(self) -> None:
        self._lock = Lock()
        self._canceled = False
        self._submitted = False

    def cancel(self) -> bool:
        with self._lock:
            if self._submitted:
                return False
            self._canceled = True
            return True

    def raise_if_canceled(self) -> None:
        with self._lock:
            if self._canceled:
                raise PublishCancelled("Publish canceled before submission")

    def mark_submitted(self) -> None:
        with self._lock:
            if self._canceled:
                raise PublishCancelled("Publish canceled before submission")
            self._submitted = True


class PublisherAdapter:
    upload_selectors = [
        'input[type=file][accept*="video"]',
        "input[type=file]",
        'input[type="file"]',
    ]
    title_selectors: list[str]
    publish_selectors: list[str]

    def publish(
        self,
        page: PublisherPage,
        request: PublishRequest,
        *,
        cancellation: PublishCancellation | None = None,
    ) -> PublishResult:
        control = cancellation or PublishCancellation()
        if page.is_login_required():
            return self._needs_user(page, request, "LOGIN_REQUIRED", "登录已失效")
        if page.has_human_challenge():
            return self._needs_user(
                page, request, "HUMAN_CHALLENGE", "需要验证码或人工确认"
            )
        try:
            control.raise_if_canceled()
            page.upload(self.upload_selectors, request.video_path)
            control.raise_if_canceled()
            copy = request.title
            if request.topics:
                copy += "\n" + " ".join(f"#{topic.lstrip('#')}" for topic in request.topics)
            page.fill(self.title_selectors, copy)
            control.raise_if_canceled()
            if request.cover_path:
                self._set_cover(page, request.cover_path)
            control.mark_submitted()
            page.click(self.publish_selectors)
            if page.has_human_challenge():
                return self._needs_user(
                    page, request, "HUMAN_CHALLENGE", "发布时触发平台验证"
                )
            if not page.wait_for_publish_success():
                return self._failure(page, request, "PUBLISH_NOT_CONFIRMED")
            return PublishResult(status="published", currentUrl=page.url)
        except PublishCancelled as error:
            return PublishResult(
                status="canceled",
                errorCode="PUBLISH_CANCELED",
                errorMessage=str(error),
                currentUrl=page.url,
            )
        except Exception as error:
            return self._failure(page, request, str(error))

    def _set_cover(self, page: PublisherPage, cover_path: str) -> None:
        page.upload(['input[type=file][accept*="image"]'], cover_path)

    def _needs_user(
        self,
        page: PublisherPage,
        request: PublishRequest,
        code: str,
        message: str,
    ) -> PublishResult:
        screenshot = self._capture(page, request, code.lower())
        return PublishResult(
            status="needs_user",
            errorCode=code,
            errorMessage=message,
            screenshotPath=screenshot,
            currentUrl=page.url,
        )

    def _failure(
        self, page: PublisherPage, request: PublishRequest, message: str
    ) -> PublishResult:
        screenshot = self._capture(page, request, "failed")
        return PublishResult(
            status="failed",
            errorCode="PUBLISH_FAILED",
            errorMessage=message[:500],
            screenshotPath=screenshot,
            currentUrl=page.url,
        )

    @staticmethod
    def _capture(
        page: PublisherPage, request: PublishRequest, suffix: str
    ) -> str:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        path = Path(request.screenshot_dir) / f"publish-{timestamp}-{suffix}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(str(path))
        return str(path)


class DouyinPublisher(PublisherAdapter):
    title_selectors = [
        '[contenteditable=true][data-placeholder*="作品标题"]',
        'textarea[placeholder*="标题"]',
        '[contenteditable=true]',
    ]
    publish_selectors = [
        'button:has-text("发布")',
        '[role=button][aria-label*="发布"]',
    ]


class XiaohongshuPublisher(PublisherAdapter):
    title_selectors = [
        'input[placeholder*="填写标题"]',
        'textarea[placeholder*="标题"]',
        '[contenteditable=true]',
    ]
    publish_selectors = [
        'button:has-text("发布")',
        '[role=button][aria-label*="发布"]',
    ]
