from __future__ import annotations

"""Durable-in-the-client, human-supervised browser publishing agent.

The browser stays open while a platform asks for login, captcha, or a manual
confirmation.  The desktop client polls this manager every five seconds and
persists the state/event trail into SQLite.
"""

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from threading import Event, Lock, Thread
from typing import Callable, Literal
from uuid import uuid4

from app.publisher.adapters import (
    DouyinPublisher,
    KuaishouPublisher,
    PublishCancellation,
    PublishCancelled,
    PublishRequest,
    PublishResult,
    WechatChannelsPublisher,
)
from app.publisher.diagnostics import PublishDiagnostics
from app.publisher.playwright_page import PersistentBrowserSession

Platform = Literal["douyin", "wechat_channels", "kuaishou"]
UPLOAD_URLS: dict[Platform, str] = {
    "douyin": "https://creator.douyin.com/creator-micro/content/upload",
    "wechat_channels": "https://channels.weixin.qq.com/platform/post/create",
    "kuaishou": "https://cp.kuaishou.com/article/publish/video",
}


AgentState = Literal[
    "queued", "opening_profile", "checking_login", "waiting_for_human",
    "uploading_video", "waiting_upload", "filling_metadata", "uploading_cover",
    "configuring_publish_time", "submitting", "verifying", "published", "failed", "canceled",
]


@dataclass
class AgentEvent:
    id: str
    state: AgentState
    level: Literal["info", "warning", "error"]
    message: str
    created_at: str
    details: dict[str, object] = field(default_factory=dict)


@dataclass
class AgentRecord:
    job_id: str
    platform: Platform
    user_data_dir: str
    request: PublishRequest
    state: AgentState = "queued"
    session_id: str = field(default_factory=lambda: str(uuid4()))
    message: str = "等待启动"
    screenshot_path: str | None = None
    current_url: str | None = None
    result_url: str | None = None
    events: list[AgentEvent] = field(default_factory=list)
    session: PersistentBrowserSession | None = None
    diagnostics: PublishDiagnostics | None = None
    cancellation: PublishCancellation = field(default_factory=PublishCancellation)
    resume_requested: Event = field(default_factory=Event)
    done: Event = field(default_factory=Event)
    thread: Thread | None = None


class BrowserAgentManager:
    def __init__(self, media_validator: Callable[[str], bool]) -> None:
        self.media_validator = media_validator
        self._records: dict[str, AgentRecord] = {}
        self._lock = Lock()

    def start(self, *, job_id: str, platform: Platform, user_data_dir: str, request: PublishRequest) -> dict:
        with self._lock:
            existing = self._records.get(job_id)
            if existing and not existing.done.is_set():
                return self._snapshot(existing)
            record = AgentRecord(job_id=job_id, platform=platform, user_data_dir=user_data_dir, request=request)
            self._records[job_id] = record
            self._spawn(record, resume=False)
            return self._snapshot(record)

    def resume(self, job_id: str) -> dict:
        with self._lock:
            record = self._records.get(job_id)
            if not record:
                raise RuntimeError("浏览器会话已结束，请重新开始发布任务")
            if record.state != "waiting_for_human":
                return self._snapshot(record)
            # The worker that opened the persistent Playwright page must also
            # resume it; sync page objects are not safe to move to a new thread.
            record.resume_requested.set()
            return self._snapshot(record)

    def cancel(self, job_id: str) -> dict | None:
        with self._lock:
            record = self._records.get(job_id)
            if not record:
                return None
            record.cancellation.cancel()
            if record.state == "waiting_for_human":
                # Wake the worker which owns the thread-affine Playwright page.
                # It performs the close in its finally block.
                record.resume_requested.set()
            return self._snapshot(record)

    def get(self, job_id: str) -> dict | None:
        with self._lock:
            record = self._records.get(job_id)
            return self._snapshot(record) if record else None

    def _spawn(self, record: AgentRecord, *, resume: bool) -> None:
        if record.thread and record.thread.is_alive():
            return
        record.done.clear()
        record.thread = Thread(target=self._run, args=(record, resume), daemon=True, name=f"publish-agent-{record.job_id[:8]}")
        record.thread.start()

    def _run(self, record: AgentRecord, resume: bool) -> None:
        page = None
        try:
            record.cancellation.raise_if_canceled()
            if not self.media_validator(record.request.video_path):
                self._transition(record, "failed", "成片文件无效或尚未写入完成，无法上传", "error")
                return
            if record.diagnostics is None:
                record.diagnostics = PublishDiagnostics(
                    record.request.screenshot_dir,
                    job_id=record.job_id,
                    platform=record.platform,
                )
                record.diagnostics.write_manifest(
                    record.request,
                    build_id=os.environ.get("AUTOCUT_BUILD_ID", "unknown"),
                    install_root=os.environ.get("AUTOCUT_INSTALL_ROOT", ""),
                )
            if record.session is None:
                self._transition(record, "opening_profile", "正在打开该账号的独立浏览器环境")
                record.session = PersistentBrowserSession(record.user_data_dir, diagnostics=record.diagnostics)
                page = record.session.start()
            else:
                page = record.session.start()
                self._transition(record, "checking_login", "正在检查人工接管后的登录状态")

            page.page.goto(UPLOAD_URLS[record.platform], wait_until="domcontentloaded")
            record.current_url = page.url
            self._record_page_state(record, page, "after-open-upload-page", screenshot=True)
            self._transition(record, "checking_login", "正在检查平台登录状态")
            page.page.wait_for_timeout(1_000)
            if page.is_login_required() or page.has_human_challenge():
                if not self._wait_for_human(record, page, "请在已打开的浏览器中完成登录、验证码或平台安全验证后，点击“继续发布”"):
                    return

            adapter = {"douyin": DouyinPublisher(), "wechat_channels": WechatChannelsPublisher(), "kuaishou": KuaishouPublisher()}[record.platform]
            messages = {
                "uploading_video": "正在通过平台文件选择控件上传视频",
                "waiting_upload": "正在等待平台确认视频上传完成",
                "filling_metadata": "正在模拟键盘输入发布标题与话题",
                "uploading_cover": "正在上传本地封面",
                "configuring_publish_time": "正在设置平台定时发布时刻",
                "submitting": "正在点击平台发布按钮",
                "verifying": "正在验证平台发布结果",
            }
            result = adapter.publish(
                page,
                record.request,
                cancellation=record.cancellation,
                on_step=lambda state: self._transition(record, state, messages[state]),
            )
            record.current_url = result.current_url or page.url
            record.screenshot_path = result.screenshot_path
            if result.status == "published":
                self._transition(record, "published", "平台已确认发布成功")
                record.result_url = result.current_url
            elif result.status == "needs_user":
                if not self._wait_for_human(record, page, result.error_message or "平台需要人工确认"):
                    return
                # Do not re-upload after a post-submit challenge.  Once the
                # user resumes, only verify whether the platform accepted it.
                self._transition(record, "verifying", "正在验证人工接管后的发布结果")
                wait_outcome = getattr(page, "wait_for_publish_outcome", None)
                outcome = wait_outcome() if callable(wait_outcome) else ("published" if page.wait_for_publish_success() else "pending")
                if outcome == "published":
                    self._transition(record, "published", "平台已确认发布成功")
                    record.result_url = page.url
                elif outcome == "needs_user":
                    return self._wait_for_human(record, page, "平台仍在等待验证，请完成验证后继续发布或取消任务")
                else:
                    self._wait_for_human(record, page, "尚未检测到发布成功，请检查页面后继续发布或取消任务")
                    return
            elif result.status == "canceled":
                self._transition(record, "canceled", result.error_message or "发布任务已取消", "warning")
            else:
                self._transition(record, "failed", result.error_message or "平台未确认发布成功", "error")
        except PublishCancelled as error:
            self._transition(record, "canceled", str(error), "warning")
        except Exception as error:  # Browser/process failures are made actionable in the UI.
            if page is not None:
                self._record_page_state(record, page, "failed", screenshot=True, html=True)
            self._transition(record, "failed", f"浏览器代理执行失败：{str(error)[:400]}", "error")
        finally:
            if record.state != "waiting_for_human":
                self._close(record)
                record.done.set()

    def _wait_for_human(self, record: AgentRecord, page, message: str) -> bool:
        screenshot_path: str | None = None
        if record.diagnostics:
            self._record_page_state(record, page, "needs-user", screenshot=True, html=True)
            screenshot_path = record.diagnostics.screenshot(page.page, "needs-user")
        else:
            screenshot = Path(record.request.screenshot_dir) / f"publish-{record.job_id}-needs-user.png"
            page.screenshot(str(screenshot))
            screenshot_path = str(screenshot)
        record.screenshot_path = screenshot_path
        record.current_url = page.url
        self._transition(record, "waiting_for_human", message, "warning")
        # Keep the persistent profile and the Playwright owner thread alive.
        # This makes login/CAPTCHA handoff resumable without moving browser
        # objects across threads or losing the platform session.
        while not record.cancellation.is_canceled():
            if not record.resume_requested.wait(timeout=1):
                continue
            record.resume_requested.clear()
            if page.is_login_required() or page.has_human_challenge():
                self._transition(record, "waiting_for_human", "验证尚未完成，请在浏览器中完成后再继续", "warning")
                continue
            self._transition(record, "checking_login", "已收到继续指令，正在检查平台状态")
            return True
        self._transition(record, "canceled", "发布任务已取消，正在关闭浏览器", "warning")
        return False

    def _close(self, record: AgentRecord) -> None:
        if record.session:
            record.session.close()
            record.session = None

    def _record_page_state(self, record: AgentRecord, page, label: str, *, screenshot: bool = False, html: bool = False) -> None:
        if not record.diagnostics:
            return
        underlying_page = getattr(page, "page", page)
        record.diagnostics.page_state(underlying_page, label)
        if screenshot:
            record.diagnostics.screenshot(underlying_page, label)
        if html:
            record.diagnostics.html(underlying_page, label)

    def _transition(self, record: AgentRecord, state: AgentState, message: str, level: Literal["info", "warning", "error"] = "info") -> None:
        with self._lock:
            record.state, record.message = state, message
            record.events.append(AgentEvent(str(uuid4()), state, level, message, datetime.now(timezone.utc).isoformat()))
            if record.diagnostics:
                record.diagnostics.state(state, message, {"level": level})

    @staticmethod
    def _snapshot(record: AgentRecord) -> dict:
        return {
            "jobId": record.job_id, "sessionId": record.session_id, "state": record.state,
            "message": record.message, "screenshotPath": record.screenshot_path,
            "currentUrl": record.current_url, "resultUrl": record.result_url,
            "terminal": record.state in {"published", "failed", "canceled"},
            "events": [{"id": event.id, "state": event.state, "level": event.level, "message": event.message, "details": event.details, "createdAt": event.created_at} for event in record.events],
        }
