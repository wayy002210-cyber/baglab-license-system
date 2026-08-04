from __future__ import annotations

from pathlib import Path
from datetime import datetime
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
        url = self.page.url.lower()
        if any(token in url for token in ("login", "passport", "signin")):
            return True
        return self._contains_visible_text(("扫码登录", "手机号登录", "登录后发布"))

    def has_human_challenge(self) -> bool:
        return self._contains_visible_text(
            ("验证码", "安全验证", "完成验证", "操作频繁", "请拖动滑块")
        )

    def upload(self, selectors: list[str], path: str) -> None:
        locator = self._first(selectors)
        locator.set_input_files(path, timeout=self.timeout_ms)

    def fill(self, selectors: list[str], value: str) -> None:
        locator = self._first(selectors)
        locator.fill(value, timeout=self.timeout_ms)

    def click(self, selectors: list[str]) -> None:
        locator = self._first(selectors)
        locator.click(timeout=self.timeout_ms)

    def set_schedule(
        self,
        toggle_selectors: list[str],
        date_selectors: list[str],
        time_selectors: list[str],
        value: datetime,
    ) -> None:
        self.click(toggle_selectors)
        self._force_fill(date_selectors, value.strftime("%Y-%m-%d"))
        self._force_fill(time_selectors, value.strftime("%H:%M"))

    def _force_fill(self, selectors: list[str], value: str) -> None:
        locator = self._first(selectors)
        locator.evaluate("element => element.removeAttribute('readonly')")
        locator.fill(value, timeout=self.timeout_ms)
        locator.dispatch_event("input")
        locator.dispatch_event("change")

    def wait_for_publish_success(self) -> bool:
        success = self.page.get_by_text(
            "发布成功", exact=False
        ).or_(self.page.get_by_text("已发布", exact=False))
        try:
            success.first.wait_for(state="visible", timeout=60_000)
            return True
        except Exception:
            return any(
                token in self.page.url.lower()
                for token in ("success", "content/manage", "published")
            )

    def screenshot(self, path: str) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.page.screenshot(path=path, full_page=True)

    def _first(self, selectors: Iterable[str]):
        for selector in selectors:
            locator = self.page.locator(selector)
            if locator.count() and locator.first.is_visible():
                return locator.first
        raise RuntimeError(f"No matching visible selector: {list(selectors)}")

    def _contains_visible_text(self, candidates: Iterable[str]) -> bool:
        for text in candidates:
            locator = self.page.get_by_text(text, exact=False)
            if locator.count() and locator.first.is_visible():
                return True
        return False


class PersistentBrowserSession:
    """Visible persistent Chromium context; user completes login challenges."""

    def __init__(
        self,
        user_data_dir: str,
        *,
        headless: bool = False,
    ) -> None:
        self.user_data_dir = user_data_dir
        self.headless = headless
        self.playwright: Playwright | None = None
        self.context: BrowserContext | None = None

    def __enter__(self) -> PlaywrightPublisherPage:
        self.playwright = sync_playwright().start()
        self.context = self.playwright.chromium.launch_persistent_context(
            self.user_data_dir,
            headless=self.headless,
            viewport={"width": 1440, "height": 900},
            locale="zh-CN",
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = self.context.pages[0] if self.context.pages else self.context.new_page()
        return PlaywrightPublisherPage(page)

    def __exit__(self, exc_type, exc, traceback) -> None:
        if self.context:
            self.context.close()
        if self.playwright:
            self.playwright.stop()
