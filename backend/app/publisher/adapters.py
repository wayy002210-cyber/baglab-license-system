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
    vertical_cover_path: str | None = Field(default=None, alias="verticalCoverPath")
    horizontal_cover_path: str | None = Field(default=None, alias="horizontalCoverPath")
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
    def upload_cover(self, trigger_selectors: list[str], input_selectors: list[str], path: str) -> None: ...
    def upload_cover_assets(self, trigger_selectors: list[str], input_selectors: list[str], vertical_cover_path: str | None, horizontal_cover_path: str | None, *, supports_dual_cover: bool) -> None: ...
    def fill(self, selectors: list[str], value: str) -> None: ...
    def fill_douyin_metadata(self, title_selectors: list[str], description_selectors: list[str], title: str, description: str, topics: list[str]) -> None: ...
    def set_schedule(self, toggle_selectors: list[str], date_selectors: list[str], time_selectors: list[str], value: datetime) -> None: ...
    def click(self, selectors: list[str]) -> None: ...
    def wait_for_publish_success(self) -> bool: ...
    def wait_for_publish_outcome(self) -> Literal["published", "needs_user", "pending"]: ...
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

    def is_canceled(self) -> bool:
        with self._lock:
            return self._canceled

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
    cover_trigger_selectors: list[str] = []
    cover_input_selectors = ['input[type=file][accept*="image"]', 'input[type=file][accept*="png"]']
    supports_dual_cover = False
    title_selectors: list[str]
    description_selectors: list[str]
    publish_selectors: list[str]
    schedule_toggle_selectors = ['label:has-text("定时发布")', '[role="radio"]:has-text("定时发布")', 'text="定时发布"']
    schedule_date_selectors = ['input[placeholder*="发布日期"]', 'input[placeholder*="选择日期"]', 'input[placeholder*="日期"]']
    schedule_time_selectors = ['input[placeholder*="发布时间"]', 'input[placeholder*="选择时间"]', 'input[placeholder*="时间"]']

    def publish(self, page: PublisherPage, request: PublishRequest, *, cancellation: PublishCancellation | None = None, on_step: Callable[[str], None] | None = None) -> PublishResult:
        control = cancellation or PublishCancellation()
        if page.is_login_required():
            return self._needs_user(page, request, "LOGIN_REQUIRED", "账号需要登录，请在浏览器窗口完成登录后继续发布。")
        if page.has_human_challenge():
            return self._needs_user(page, request, "HUMAN_CHALLENGE", "平台要求验证码或安全验证，请在浏览器窗口完成验证后继续。")

        stage = "上传视频"
        try:
            control.raise_if_canceled()
            self._step(on_step, "uploading_video")
            page.upload(self.upload_selectors, request.video_path)
            control.raise_if_canceled()
            stage = "填写标题与话题"
            self._step(on_step, "filling_metadata")
            self.fill_metadata(page, request)

            stage = "等待视频上传完成"
            self._step(on_step, "waiting_upload")
            wait_upload = getattr(page, "wait_for_upload_ready", None)
            if callable(wait_upload) and not wait_upload():
                return self._failed(page, request, "UPLOAD_CONFIRMATION_TIMEOUT", "上传视频后未在限定时间内检测到平台完成状态，请检查网络、视频格式或平台页面。")

            vertical_cover_path = request.vertical_cover_path or request.cover_path
            horizontal_cover_path = request.horizontal_cover_path
            if vertical_cover_path or horizontal_cover_path:
                stage = "设置封面"
                self._step(on_step, "uploading_cover")
                specialized = getattr(page, "upload_cover_assets", None)
                if callable(specialized):
                    specialized(
                        self.cover_trigger_selectors,
                        self.cover_input_selectors,
                        vertical_cover_path,
                        horizontal_cover_path,
                        supports_dual_cover=self.supports_dual_cover,
                    )
                else:
                    page.upload_cover(self.cover_trigger_selectors, self.cover_input_selectors, vertical_cover_path or horizontal_cover_path)

            if request.scheduled_at:
                stage = "设置发布时间"
                self._step(on_step, "configuring_publish_time")
                page.set_schedule(self.schedule_toggle_selectors, self.schedule_date_selectors, self.schedule_time_selectors, request.scheduled_at)

            control.raise_if_canceled()
            stage = "提交发布"
            control.mark_submitted()
            self._step(on_step, "submitting")
            page.click(self.publish_selectors)
            stage = "验证发布结果"
            self._step(on_step, "verifying")
            wait_outcome = getattr(page, "wait_for_publish_outcome", None)
            outcome = wait_outcome() if callable(wait_outcome) else (
                "needs_user" if page.has_human_challenge() else ("published" if page.wait_for_publish_success() else "pending")
            )
            if outcome == "needs_user":
                return self._needs_user(page, request, "HUMAN_CHALLENGE", "发布时触发平台验证，请在浏览器窗口完成验证后继续。")
            if outcome != "published":
                return self._failed(page, request, "PUBLISH_NOT_CONFIRMED", "已点击发布，但未检测到平台成功提示或内容管理页记录。")
            return PublishResult(status="published", currentUrl=page.url)
        except PublishCancelled as error:
            return PublishResult(status="canceled", errorCode="PUBLISH_CANCELED", errorMessage=str(error), currentUrl=page.url)
        except Exception as error:
            return self._failed(page, request, "AUTOMATION_STEP_FAILED", f"{stage}失败：{str(error)[:220]}")

    def fill_metadata(self, page: PublisherPage, request: PublishRequest) -> None:
        page.fill(self.title_selectors, request.title)
        copy = request.description.strip()
        tags = " ".join(f"#{value.lstrip('#')}" for value in request.topics if value.strip().lstrip("#"))
        metadata = "\n".join(value for value in (copy, tags) if value)
        if metadata:
            page.fill(self.description_selectors, metadata)

    @staticmethod
    def _step(callback: Callable[[str], None] | None, state: str) -> None:
        if callback:
            callback(state)

    def _capture(self, page: PublisherPage, request: PublishRequest, suffix: str) -> str | None:
        path = Path(request.screenshot_dir) / f"publish-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}-{suffix}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            page.screenshot(str(path))
            return str(path)
        except Exception:
            return None

    def _needs_user(self, page: PublisherPage, request: PublishRequest, code: str, message: str) -> PublishResult:
        return PublishResult(status="needs_user", errorCode=code, errorMessage=message, screenshotPath=self._capture(page, request, code.lower()), currentUrl=page.url)

    def _failed(self, page: PublisherPage, request: PublishRequest, code: str, message: str) -> PublishResult:
        return PublishResult(status="failed", errorCode=code, errorMessage=message, screenshotPath=self._capture(page, request, code.lower()), currentUrl=page.url)


class DouyinPublisher(PublisherAdapter):
    supports_dual_cover = True
    # The creator page has independent title and description inputs. They must
    # not share a generic contenteditable fallback.
    title_selectors = ['[contenteditable="true"][data-placeholder*="作品标题"]', '[contenteditable="true"][data-placeholder*="填写作品标题"]', '[contenteditable="true"][placeholder*="作品标题"]', '[contenteditable="true"][aria-label*="作品标题"]', 'input[placeholder*="作品标题"]', 'input[placeholder*="填写作品标题"]', 'textarea[placeholder*="作品标题"]']
    description_selectors = ['[contenteditable="true"][data-placeholder*="作品描述"]', '[contenteditable="true"][data-placeholder*="添加作品简介"]', '[contenteditable="true"][data-placeholder*="作品简介"]', '[contenteditable="true"][placeholder*="作品描述"]', '[contenteditable="true"][aria-label*="作品描述"]', 'textarea[placeholder*="作品描述"]']
    cover_trigger_selectors = ['button:has-text("设置封面")', '[role="button"]:has-text("设置封面")', 'text="设置封面"']
    publish_selectors = ['button:text-is("发布")', '[role="button"]:text-is("发布")', 'button:has-text("发布")']

    def fill_metadata(self, page: PublisherPage, request: PublishRequest) -> None:
        title = request.title.strip()[:30]
        topics = [value.strip().lstrip("#") for value in request.topics if value.strip().lstrip("#")]
        specialized = getattr(page, "fill_douyin_metadata", None)
        if callable(specialized):
            # Douyin uses the compact title control for the title.  Its large
            # description editor receives hashtags only, never the full script.
            specialized(self.title_selectors, self.description_selectors, title, "", topics)
            return
        page.fill(self.title_selectors, title)
        metadata = (" ".join(f"#{topic}" for topic in topics) + " ") if topics else ""
        if metadata:
            page.fill(self.description_selectors, metadata)


class WechatChannelsPublisher(PublisherAdapter):
    title_selectors = ['input[placeholder*="标题"]', 'textarea[placeholder*="标题"]', '[contenteditable="true"][data-placeholder*="标题"]']
    description_selectors = ['textarea[placeholder*="描述"]', '[contenteditable="true"][data-placeholder*="描述"]', '[contenteditable="true"]']
    publish_selectors = ['button:has-text("发表")', 'button:has-text("发布")', '[role="button"][aria-label*="发布"]']


class KuaishouPublisher(PublisherAdapter):
    title_selectors = ['input[placeholder*="标题"]', 'textarea[placeholder*="标题"]', '[contenteditable="true"][data-placeholder*="标题"]']
    description_selectors = ['textarea[placeholder*="描述"]', 'textarea[placeholder*="作品描述"]', '[contenteditable="true"]']
    publish_selectors = ['button:has-text("发布")', 'button:has-text("确认发布")', '[role="button"]:has-text("发布")']
