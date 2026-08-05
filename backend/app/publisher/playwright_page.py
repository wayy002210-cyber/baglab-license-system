from __future__ import annotations

from datetime import datetime
from pathlib import Path
from time import monotonic, sleep
from typing import Iterable

from playwright.sync_api import BrowserContext, Page, Playwright, sync_playwright


class PlaywrightPublisherPage:
    def __init__(self, page: Page, timeout_ms: int = 30_000) -> None:
        self.page = page
        self.timeout_ms = timeout_ms

    @property
    def url(self) -> str:
        return self.page.url

    def is_login_required(self) -> bool:
        return any(value in self.page.url.lower() for value in ("login", "passport", "signin")) or self._contains_visible_text(("扫码登录", "手机号登录", "登录后发布", "登录/注册"))

    def has_human_challenge(self) -> bool:
        return self._contains_visible_text(("验证码", "安全验证", "完成验证", "操作频繁", "请拖动滑块", "短信验证"))

    def upload(self, selectors: list[str], path: str) -> None:
        self._first(selectors).set_input_files(path, timeout=self.timeout_ms)

    def wait_for_upload_ready(self) -> bool:
        deadline = monotonic() + 300
        while monotonic() < deadline:
            if self._contains_visible_text(("上传失败", "重新上传")):
                return False
            if self._contains_visible_text(("上传完成", "上传成功", "更换视频")):
                return True
            # 部分平台上传完成后只会隐藏进度提示并显示作品信息表单。
            if not self._contains_visible_text(("上传中", "正在上传", "处理中")) and self._contains_visible_text(("作品描述", "作品标题", "添加话题")):
                return True
            self.page.wait_for_timeout(1_000)
        return False

    def fill(self, selectors: list[str], value: str) -> None:
        locator = self._first(selectors)
        # Use visible keyboard interactions only. Do not mutate the platform DOM
        # through JavaScript: browser automation should behave like a real user.
        locator.click(timeout=self.timeout_ms)
        locator.press("Control+A")
        locator.press("Backspace")
        locator.press_sequentially(value, delay=12)

    def click(self, selectors: list[str]) -> None:
        self._first(selectors).click(timeout=self.timeout_ms)

    def set_schedule(self, toggle_selectors: list[str], date_selectors: list[str], time_selectors: list[str], value: datetime) -> None:
        self.click(toggle_selectors)
        self.fill(date_selectors, value.strftime("%Y-%m-%d"))
        self.fill(time_selectors, value.strftime("%H:%M"))

    def wait_for_publish_success(self) -> bool:
        success = self.page.get_by_text("发布成功", exact=False).or_(self.page.get_by_text("已发布", exact=False)).or_(self.page.get_by_text("发布完成", exact=False))
        try:
            success.first.wait_for(state="visible", timeout=60_000)
            return True
        except Exception:
            return any(value in self.page.url.lower() for value in ("success", "content/manage", "published"))

    def screenshot(self, path: str) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.page.screenshot(path=path, full_page=True)

    def _first(self, selectors: Iterable[str]):
        candidates = list(selectors)
        deadline = monotonic() + self.timeout_ms / 1000
        while monotonic() < deadline:
            for selector in candidates:
                locator = self.page.locator(selector)
                if locator.count() and locator.first.is_visible():
                    return locator.first
            sleep(0.1)
        raise RuntimeError(f"No matching visible selector: {candidates}")

    def _contains_visible_text(self, candidates: Iterable[str]) -> bool:
        for text in candidates:
            locator = self.page.get_by_text(text, exact=False)
            if locator.count() and locator.first.is_visible():
                return True
        return False


class PersistentBrowserSession:
    def __init__(self, user_data_dir: str, *, headless: bool = False) -> None:
        self.user_data_dir = user_data_dir
        self.headless = headless
        self.playwright: Playwright | None = None
        self.context: BrowserContext | None = None

    def start(self) -> PlaywrightPublisherPage:
        if self.context:
            page = self.context.pages[0] if self.context.pages else self.context.new_page()
            return PlaywrightPublisherPage(page)
        self.playwright = sync_playwright().start()
        self.context = self.playwright.chromium.launch_persistent_context(
            self.user_data_dir,
            headless=self.headless,
            viewport={"width": 1440, "height": 900},
            locale="zh-CN",
        )
        page = self.context.pages[0] if self.context.pages else self.context.new_page()
        return PlaywrightPublisherPage(page)

    def close(self) -> None:
        if self.context:
            self.context.close()
            self.context = None
        if self.playwright:
            self.playwright.stop()
            self.playwright = None

    def __enter__(self) -> PlaywrightPublisherPage:
        return self.start()

    def __exit__(self, exc_type, exc, traceback) -> None:
        self.close()
