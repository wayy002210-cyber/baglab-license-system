from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Callable, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field


class PublishRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    video_path: str = Field(alias="videoPath")
    title: str = Field(min_length=1)
    description: str = ""
    topics: list[str] = Field(default_factory=list)
    cover_path: str | None = Field(default=None, alias="coverPath")
    screenshot_dir: str = Field(alias="screenshotDir")
    scheduled_at: datetime | None = Field(default=None, alias="scheduledAt")


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
    def set_schedule(self, toggle_selectors: list[str], date_selectors: list[str], time_selectors: list[str], value: datetime) -> None: ...
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
                raise PublishCancelled("发布任务已取消")

    def mark_submitted(self) -> None:
        with self._lock:
            if self._canceled:
                raise PublishCancelled("发布任务已取消")
            self._submitted = True


class PublisherAdapter:
    upload_selectors = ['input[type=file][accept*="video"]', 'input[type=file]']
    title_selectors: list[str]
    description_selectors: list[str]
    publish_selectors: list[str]
    schedule_toggle_selectors = ['label:has-text("定时发布")', '[role=radio]:has-text("定时发布")', 'text="定时发布"']
    schedule_date_selectors = ['input[placeholder*="发布日期"]', 'input[placeholder*="选择日期"]', 'input[placeholder*="日期"]']
    schedule_time_selectors = ['input[placeholder*="发布时间"]', 'input[placeholder*="选择时间"]', 'input[placeholder*="时间"]']

    def publish(
        self,
        page: PublisherPage,
        request: PublishRequest,
        *,
        cancellation: PublishCancellation | None = None,
        on_step: Callable[[str], None] | None = None,
    ) -> PublishResult:
        control = cancellation or PublishCancellation()
        if page.is_login_required():
            return self._needs_user(page, request, "LOGIN_REQUIRED", "账号登录已失效，请在浏览器窗口重新登录")
        if page.has_human_challenge():
            return self._needs_user(page, request, "HUMAN_CHALLENGE", "平台要求验证码或人工确认，请在浏览器窗口完成验证")
        try:
            control.raise_if_canceled()
            if on_step: on_step("uploading_video")
            page.upload(self.upload_selectors, request.video_path)
            if on_step: on_step("waiting_upload")
            wait_upload = getattr(page, "wait_for_upload_ready", None)
            if callable(wait_upload) and not wait_upload():
                return self._failure(page, request, "视频上传超时，请检查网络后重试")
            control.raise_if_canceled()
            if on_step: on_step("filling_metadata")
            page.fill(self.title_selectors, request.title)
            copy = request.description.strip()
            tags = " ".join(f"#{value.lstrip('#')}" for value in request.topics)
            copy = (copy + "\n" if copy and tags else copy) + tags
            if copy:
                page.fill(self.description_selectors, copy)
            if request.scheduled_at:
                if on_step: on_step("configuring_publish_time")
                page.set_schedule(self.schedule_toggle_selectors, self.schedule_date_selectors, self.schedule_time_selectors, request.scheduled_at)
            if request.cover_path:
                if on_step: on_step("uploading_cover")
                page.upload(['input[type=file][accept*="image"]'], request.cover_path)
            control.raise_if_canceled()
            control.mark_submitted()
            if on_step: on_step("submitting")
            page.click(self.publish_selectors)
            if page.has_human_challenge():
                return self._needs_user(page, request, "HUMAN_CHALLENGE", "发布时触发平台验证，请在浏览器窗口完成验证")
            if on_step: on_step("verifying")
            if not page.wait_for_publish_success():
                return self._failure(page, request, "平台未返回发布成功确认，请检查平台内容管理")
            return PublishResult(status="published", currentUrl=page.url)
        except PublishCancelled as error:
            return PublishResult(status="canceled", errorCode="PUBLISH_CANCELED", errorMessage=str(error), currentUrl=page.url)
        except Exception as error:
            if "No matching visible selector" in str(error):
                return self._needs_user(page, request, "PAGE_CHANGED", "平台发布页面结构发生变化，已保存现场截图，请人工确认")
            return self._failure(page, request, str(error))

    def _capture(self, page: PublisherPage, request: PublishRequest, suffix: str) -> str:
        path = Path(request.screenshot_dir) / f"publish-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}-{suffix}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(str(path))
        return str(path)

    def _needs_user(self, page: PublisherPage, request: PublishRequest, code: str, message: str) -> PublishResult:
        return PublishResult(status="needs_user", errorCode=code, errorMessage=message, screenshotPath=self._capture(page, request, code.lower()), currentUrl=page.url)

    def _failure(self, page: PublisherPage, request: PublishRequest, message: str) -> PublishResult:
        return PublishResult(status="failed", errorCode="PUBLISH_FAILED", errorMessage=message[:500], screenshotPath=self._capture(page, request, "failed"), currentUrl=page.url)


class DouyinPublisher(PublisherAdapter):
    title_selectors = ['input[placeholder*="作品标题"]', '[contenteditable=true][data-placeholder*="作品标题"]', 'textarea[placeholder*="作品标题"]', 'textarea[placeholder*="标题"]']
    description_selectors = ['[contenteditable=true][data-placeholder*="作品简介"]', '[contenteditable=true][data-placeholder*="添加作品简介"]', 'textarea[placeholder*="作品简介"]', '[contenteditable=true][role=textbox]']
    publish_selectors = ['button:has-text("发布")', '[role=button][aria-label*="发布"]', '[role=button]:has-text("发布")']


class WechatChannelsPublisher(PublisherAdapter):
    title_selectors = ['input[placeholder*="标题"]', 'textarea[placeholder*="标题"]', '[contenteditable=true]']
    description_selectors = ['textarea[placeholder*="描述"]', '[contenteditable=true][data-placeholder*="描述"]', '[contenteditable=true]']
    publish_selectors = ['button:has-text("发表")', 'button:has-text("发布")', '[role=button][aria-label*="发布"]']


class KuaishouPublisher(PublisherAdapter):
    title_selectors = ['input[placeholder*="标题"]', 'textarea[placeholder*="标题"]', '[contenteditable=true][data-placeholder*="标题"]']
    description_selectors = ['textarea[placeholder*="描述"]', 'textarea[placeholder*="作品描述"]', '[contenteditable=true]']
    publish_selectors = ['button:has-text("发布")', 'button:has-text("确认发布")', '[role=button]:has-text("发布")']
