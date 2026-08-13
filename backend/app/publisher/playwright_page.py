from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
from time import monotonic, sleep
from typing import Any, Iterable

from playwright.sync_api import BrowserContext, Page, Playwright, TimeoutError as PlaywrightTimeoutError, sync_playwright

from app.publisher.diagnostics import PublishDiagnostics


def resolve_bundled_chromium() -> str | None:
    """Return the packaged Chromium executable when one is available.

    Playwright's headless mode otherwise looks for a separate
    ``chromium_headless_shell`` download.  The desktop installer deliberately
    ships one Chromium build only, so always prefer that executable for both
    visible login and silent status checks.
    """
    browser_root = os.environ.get("PLAYWRIGHT_BROWSERS_PATH", "").strip()
    if not browser_root:
        return None
    root = Path(browser_root)
    if not root.is_dir():
        return None
    candidates = sorted(root.glob("chromium-*/chrome-win*/chrome.exe"), reverse=True)
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return None


class PlaywrightPublisherPage:
    def __init__(self, page: Page, timeout_ms: int = 30_000, diagnostics: PublishDiagnostics | None = None) -> None:
        self.page = page
        self.timeout_ms = timeout_ms
        self.diagnostics = diagnostics

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
        success_markers = ("上传完成", "上传成功", "极速上传成功", "文件解析完成")
        while monotonic() < deadline:
            if self._contains_visible_text(("上传失败", "格式不支持")):
                return False
            if self._contains_visible_text(success_markers):
                return True
            self.page.wait_for_timeout(1_000)
        return False

    def fill(self, selectors: list[str], value: str) -> None:
        locator = self._first(selectors)
        # Real pointer and keyboard actions only: no clipboard and no DOM injection.
        #
        # Some creator-page editors remove or mutate placeholder attributes as
        # soon as they receive focus.  Playwright's Locator.press re-resolves
        # the original selector for every key event, so a valid focused editor
        # can time out after click.  Once focus is established, send keyboard
        # events to the active element instead.
        self._replace_focused_text(locator, value, delay=12)

    def fill_douyin_metadata(
        self,
        title_selectors: list[str],
        description_selectors: list[str],
        title: str,
        description: str,
        topics: list[str],
    ) -> None:
        """Use independent creator controls and only real pointer/keyboard input."""
        title_locator = self._first(title_selectors)
        title_locator.scroll_into_view_if_needed(timeout=self.timeout_ms)
        self._replace_focused_text(title_locator, title, delay=28)

        locator = self._first_douyin_description(description_selectors, title_locator)
        locator.scroll_into_view_if_needed(timeout=self.timeout_ms)
        self._replace_focused_text(locator, description, delay=18)
        if topics:
            if description:
                self.page.keyboard.press("Enter")
            for topic in topics:
                self.page.keyboard.type(f"#{topic}", delay=28)
                self.page.keyboard.press("Space")
                self.page.wait_for_timeout(120)

    def upload_cover(self, trigger_selectors: list[str], input_selectors: list[str], path: str) -> None:
        """Compatibility path for platform adapters that expose one cover slot."""
        self.click(trigger_selectors)
        dialog = self._cover_dialog()
        # Preserve the existing single-slot behavior for other platform
        # adapters.  The explicit mode/upload sequence belongs to the dual
        # cover workflow below.
        self._set_cover_file(dialog, input_selectors, path)
        self._confirm_cover(dialog)

    def upload_cover_assets(
        self,
        trigger_selectors: list[str],
        input_selectors: list[str],
        vertical_cover_path: str | None,
        horizontal_cover_path: str | None,
        *,
        supports_dual_cover: bool,
    ) -> None:
        selected = vertical_cover_path or horizontal_cover_path
        if not selected:
            return
        if not supports_dual_cover:
            self.upload_cover(trigger_selectors, input_selectors, selected)
            return
        self._open_douyin_vertical_cover_entry()
        dialog = self._cover_dialog()
        if dialog is None:
            raise RuntimeError("点击竖封面入口后未检测到封面编辑弹窗")

        if vertical_cover_path and horizontal_cover_path:
            self._require_cover_mode(dialog, "vertical")
            self._upload_cover_file(dialog, input_selectors, vertical_cover_path)
            self._select_cover_mode(dialog, "horizontal", prefer_last=True)
            self._require_cover_mode(dialog, "horizontal")
            self._upload_cover_file(dialog, input_selectors, horizontal_cover_path)
        elif vertical_cover_path:
            self._require_cover_mode(dialog, "vertical")
            self._upload_cover_file(dialog, input_selectors, vertical_cover_path)
            self._select_cover_mode(dialog, "horizontal", prefer_last=True)
            self._require_cover_mode(dialog, "horizontal")
        else:
            self._require_cover_mode(dialog, "vertical")
            self._select_cover_mode(dialog, "horizontal")
            self._require_cover_mode(dialog, "horizontal")
            self._upload_cover_file(dialog, input_selectors, horizontal_cover_path)

        self._confirm_cover(dialog)

    def _open_douyin_vertical_cover_entry(self) -> None:
        scope = self.page.locator(".content-upload-new")
        candidates = scope.locator('div[class*="coverControl-"]').filter(has_text="竖封面3:4").filter(has_text="选择封面")
        for index in range(candidates.count()):
            candidate = candidates.nth(index)
            if candidate.is_visible():
                candidate.scroll_into_view_if_needed(timeout=self.timeout_ms)
                candidate.click(timeout=self.timeout_ms)
                return
        raise RuntimeError("未找到竖封面3:4的‘选择封面’入口")

    def _require_cover_mode(self, dialog, mode: str) -> None:
        preview = "竖封面预览（3:4）" if mode == "vertical" else "横封面预览（4:3）"
        switch = "设置横封面" if mode == "vertical" else "设置竖封面"
        selectors = [f'text="{preview}"', f'button:text-is("{switch}")', f'[role="button"]:text-is("{switch}")']
        if self._first_visible_in(dialog, selectors) is None:
            raise RuntimeError(f"封面编辑弹窗未进入{'竖' if mode == 'vertical' else '横'}封面状态")

    def _select_cover_mode(self, dialog, mode: str, *, prefer_last: bool = False) -> None:
        label = "设置竖封面" if mode == "vertical" else "设置横封面"
        selectors = [
            f'button:text-is("{label}")',
            f'[role="button"]:text-is("{label}")',
            f'[role="tab"]:text-is("{label}")',
            f'text="{label}"',
        ]
        clicked = self._click_last_if_visible_in(dialog, selectors) if prefer_last else self._click_if_visible_in(dialog, selectors)
        if not clicked:
            raise RuntimeError(f"未找到封面模式按钮：{label}")
        self.page.wait_for_timeout(300)

    def _upload_cover_file(self, dialog, input_selectors: list[str], path: str) -> None:
        """Click the active mode's upload control before assigning its file."""
        upload_selectors = [
            'button:text-is("上传封面")',
            '[role="button"]:text-is("上传封面")',
            'text="上传封面"',
            'button:text-is("选择封面")',
            '[role="button"]:text-is("选择封面")',
            'button:text-is("本地上传")',
            '[role="button"]:text-is("本地上传")',
            'button:text-is("上传图片")',
            '[role="button"]:text-is("上传图片")',
        ]
        trigger = self._first_visible_in(dialog, upload_selectors)
        owned_input = trigger.locator(
            'xpath=ancestor::*[.//input[@type="file"]][1]//input[@type="file"]'
        )
        if owned_input.count():
            owned_input.first.set_input_files(path, timeout=self.timeout_ms)
            self._save_cover_crop_if_visible(dialog)
            self.page.wait_for_timeout(300)
            return
        try:
            with self.page.expect_file_chooser(timeout=min(self.timeout_ms, 2_000)) as chooser_info:
                trigger.click(timeout=self.timeout_ms)
            chooser_info.value.set_files(path)
        except PlaywrightTimeoutError:
            # Some page variants reveal an attached input instead of emitting
            # a file-chooser event. Bind only to the input owned by the upload
            # control that was just clicked; the editor keeps both cover
            # inputs mounted and a dialog-wide first match can target the
            # inactive aspect ratio.
            self._set_cover_file(dialog, input_selectors, path)
        self._save_cover_crop_if_visible(dialog)
        self.page.wait_for_timeout(300)

    def _save_cover_crop_if_visible(self, editor_dialog) -> None:
        dialogs = self.page.locator('[role="dialog"], .semi-modal, .arco-modal, .modal')
        for index in range(dialogs.count() - 1, -1, -1):
            candidate = dialogs.nth(index)
            if not candidate.is_visible():
                continue
            save = candidate.locator('button:text-is("保存"), [role="button"]:text-is("保存")')
            for save_index in range(save.count() - 1, -1, -1):
                button = save.nth(save_index)
                if button.is_visible():
                    button.click(timeout=self.timeout_ms)
                    candidate.wait_for(state="hidden", timeout=self.timeout_ms)
                    return

    def _confirm_cover(self, dialog) -> None:
        try:
            self._click_last_in(dialog, [
                'button:text-is("完成")',
                '[role="button"]:text-is("完成")',
                'text="完成"',
                'button:text-is("确认")',
                '[role="button"]:text-is("确认")',
                'text="确认"',
                'button:text-is("保存封面")',
                '[role="button"]:text-is("保存封面")',
                'text="保存封面"',
            ])
        except RuntimeError:
            # Some single-cover platform variants apply immediately.
            pass

    def _set_cover_file(self, dialog, input_selectors: list[str], path: str, *, prefer_last: bool = False) -> None:
        scopes = [dialog] if dialog is not None else []
        scopes.append(self.page)
        attached = None
        for scope in scopes:
            for selector in input_selectors:
                candidates = scope.locator(selector)
                for index in range(candidates.count()):
                    candidate = candidates.nth(index)
                    if candidate.is_visible():
                        candidate.set_input_files(path, timeout=self.timeout_ms)
                        return
                if candidates.count():
                    attached = candidates.last if prefer_last else candidates.first
        if attached is not None:
            attached.set_input_files(path, timeout=self.timeout_ms)
            return
        self._set_cover_with_file_chooser(dialog, path)

    def click(self, selectors: list[str]) -> None:
        locator = self._first(selectors)
        locator.scroll_into_view_if_needed(timeout=self.timeout_ms)
        locator.click(timeout=self.timeout_ms)

    def set_schedule(self, toggle_selectors: list[str], date_selectors: list[str], time_selectors: list[str], value: datetime) -> None:
        platform_time = value.astimezone(timezone(timedelta(hours=8)))
        expected_date = platform_time.strftime("%Y-%m-%d")
        expected_time = platform_time.strftime("%H:%M")
        self.click(toggle_selectors)
        date_input = self._first(date_selectors)
        time_input = self._first(time_selectors)
        if self._is_combined_datetime_input(date_input, time_input):
            expected_datetime = f"{expected_date} {expected_time}"
            date_input.fill(expected_datetime, timeout=self.timeout_ms)
            date_input.press("Enter", timeout=self.timeout_ms)
            self.page.wait_for_timeout(200)
            actual_datetime = date_input.input_value().strip()
            if actual_datetime != expected_datetime:
                raise RuntimeError(
                    f"平台时间设置失败：目标 {expected_datetime}，页面实际 {actual_datetime}"
                )
            return
        date_input.click(timeout=self.timeout_ms)
        date_selected = self._click_visible_picker_option([
            f'[data-date="{expected_date}"]',
            f'[title="{expected_date}"]',
            f'text="{platform_time.day}"',
        ])
        if not date_selected:
            self._replace_focused_text(date_input, expected_date, delay=18)

        time_input.click(timeout=self.timeout_ms)
        time_selected = self._click_visible_picker_option([
            f'[data-time="{expected_time}"]',
            f'[title="{expected_time}"]',
            f'text="{expected_time}"',
        ])
        if not time_selected:
            self._replace_focused_text(time_input, expected_time, delay=18)
        self.page.keyboard.press("Tab")
        self.page.wait_for_timeout(200)
        actual_date = date_input.input_value().strip()
        actual_time = time_input.input_value().strip()
        if actual_date != expected_date or actual_time != expected_time:
            raise RuntimeError(
                f"平台时间设置失败：目标 {expected_date} {expected_time}，页面实际 {actual_date} {actual_time}"
            )

    def _is_combined_datetime_input(self, date_input, time_input) -> bool:
        placeholder = (date_input.get_attribute("placeholder") or "").strip()
        value_format = (date_input.get_attribute("format") or "").strip()
        if ("日期" in placeholder and "时间" in placeholder) or ("HH" in value_format and "dd" in value_format):
            return True
        date_element = date_input.element_handle(timeout=self.timeout_ms)
        time_element = time_input.element_handle(timeout=self.timeout_ms)
        return date_element is not None and date_element == time_element

    def _click_visible_picker_option(self, selectors: list[str]) -> bool:
        for selector in selectors:
            candidates = self.page.locator(selector)
            for index in range(candidates.count() - 1, -1, -1):
                candidate = candidates.nth(index)
                if not candidate.is_visible():
                    continue
                try:
                    candidate.click(timeout=min(self.timeout_ms, 2_000))
                    return True
                except Exception:
                    continue
        return False

    def wait_for_publish_success(self) -> bool:
        return self.wait_for_publish_outcome() == "published"

    def wait_for_publish_outcome(self) -> str:
        """Wait for a platform result without mistaking delayed SMS verification for failure."""
        deadline = monotonic() + 90
        success_markers = ("发布成功", "已发布", "发布完成", "定时发布成功")
        while monotonic() < deadline:
            if self.has_human_challenge() or self.is_login_required():
                return "needs_user"
            if self._contains_visible_text(success_markers) or any(value in self.page.url.lower() for value in ("success", "content/manage", "published")):
                return "published"
            if self._contains_visible_text(("发布失败", "发布异常", "上传失败")):
                return "pending"
            self.page.wait_for_timeout(1_000)
        return "pending"

    def _first_douyin_description(self, selectors: Iterable[str], title_locator):
        try:
            return self._first(selectors)
        except RuntimeError:
            # The current creator page leaves the description editor without a
            # stable attribute. Select the visible multi-line editor only; all
            # writes still use browser keyboard events.
            title_box = title_locator.bounding_box()
            editors = self.page.locator('[contenteditable="true"]')
            for index in range(editors.count()):
                candidate = editors.nth(index)
                if not candidate.is_visible():
                    continue
                box = candidate.bounding_box()
                if box and box.get("height", 0) >= 48 and (not title_box or abs(box.get("y", 0) - title_box.get("y", 0)) > 8):
                    return candidate
            raise

    def _replace_focused_text(self, locator, value: str, *, delay: int) -> None:
        locator.click(timeout=self.timeout_ms)
        self.page.keyboard.press("Control+A")
        self.page.keyboard.press("Backspace")
        if value:
            self.page.keyboard.type(value, delay=delay)

    def _cover_dialog(self):
        # The cover editor may be an inline panel rather than a dialog.  Keep
        # this probe short so a platform variant without a modal cannot stall
        # the whole publish run for the default selector timeout.
        deadline = monotonic() + min(self.timeout_ms / 1000, 0.8)
        while monotonic() < deadline:
            dialogs = self.page.locator('[role="dialog"], .semi-modal, .arco-modal, .modal')
            for index in range(dialogs.count()):
                candidate = dialogs.nth(index)
                if candidate.is_visible():
                    return candidate
            self.page.wait_for_timeout(100)
        return None

    def _first_in(self, parent, selectors: Iterable[str]):
        for selector in selectors:
            candidate = parent.locator(selector)
            if candidate.count():
                return candidate.first
        return self._first(selectors)

    def _first_attached_in(self, parent, selectors: Iterable[str]):
        candidates = list(selectors)
        scopes = [parent] if parent is not None else []
        scopes.append(self.page)
        report: list[dict[str, object]] = []
        for scope in scopes:
            for selector in candidates:
                locator = scope.locator(selector)
                count = locator.count()
                visible = bool(count and locator.first.is_visible())
                report.append({"selector": selector, "count": count, "firstVisible": visible})
                if count:
                    if self.diagnostics:
                        self.diagnostics.locator("matched_attached", candidates, report)
                    return locator.first
        if self.diagnostics:
            self.diagnostics.locator("not_attached", candidates, report)
        return None

    def _set_cover_with_file_chooser(self, dialog, path: str) -> None:
        upload_selectors = [
            'button:has-text("上传封面")',
            '[role="button"]:has-text("上传封面")',
            'text="上传封面"',
            'button:has-text("选择封面")',
            '[role="button"]:has-text("选择封面")',
            'text="选择封面"',
            'button:has-text("本地上传")',
            '[role="button"]:has-text("本地上传")',
            'text="本地上传"',
            'button:has-text("上传图片")',
            '[role="button"]:has-text("上传图片")',
            'text="上传图片"',
        ]
        trigger = self._first_visible_in(dialog, upload_selectors)
        with self.page.expect_file_chooser(timeout=self.timeout_ms) as chooser_info:
            trigger.click(timeout=self.timeout_ms)
        chooser_info.value.set_files(path)

    def _first_visible_in(self, parent, selectors: Iterable[str]):
        candidates = list(selectors)
        deadline = monotonic() + self.timeout_ms / 1000
        while monotonic() < deadline:
            report: list[dict[str, object]] = []
            scopes = [parent] if parent is not None else []
            scopes.append(self.page)
            for scope in scopes:
                for selector in candidates:
                    locator = scope.locator(selector)
                    count = locator.count()
                    visible_indexes: list[int] = []
                    for index in range(count):
                        item = locator.nth(index)
                        if item.is_visible():
                            visible_indexes.append(index)
                            report.append({"selector": selector, "count": count, "visibleIndexes": visible_indexes})
                            if self.diagnostics:
                                self.diagnostics.locator("matched", candidates, report)
                            return item
                    report.append({"selector": selector, "count": count, "visibleIndexes": visible_indexes})
            if self.diagnostics:
                self.diagnostics.locator("poll", candidates, report)
            sleep(0.1)
        if self.diagnostics:
            self.diagnostics.locator("not_found", candidates, [])
        raise RuntimeError(f"未找到可见的页面控件：{candidates}")

    def _click_in(self, parent, selectors: Iterable[str]) -> None:
        if parent is not None:
            for selector in selectors:
                candidate = parent.locator(selector)
                if candidate.count() and candidate.first.is_visible():
                    candidate.first.click(timeout=self.timeout_ms)
                    return
        self.click(list(selectors))

    def _click_last_in(self, parent, selectors: Iterable[str]) -> None:
        if self._click_last_if_visible_in(parent, selectors):
            return
        self.click(list(selectors))

    def _click_if_visible_in(self, parent, selectors: Iterable[str]) -> bool:
        scopes = [parent] if parent is not None else []
        scopes.append(self.page)
        for scope in scopes:
            for selector in selectors:
                candidate = scope.locator(selector)
                if candidate.count() and candidate.first.is_visible():
                    candidate.first.click(timeout=self.timeout_ms)
                    return True
        return False

    def _click_last_if_visible_in(self, parent, selectors: Iterable[str]) -> bool:
        scopes = [parent] if parent is not None else []
        scopes.append(self.page)
        for scope in scopes:
            for selector in selectors:
                candidate = scope.locator(selector)
                for index in range(candidate.count() - 1, -1, -1):
                    item = candidate.nth(index)
                    if item.is_visible():
                        item.click(timeout=self.timeout_ms)
                        return True
        return False

    def _legacy_wait_for_publish_success(self) -> bool:
        success = self.page.get_by_text("发布成功", exact=False).or_(self.page.get_by_text("已发布", exact=False)).or_(self.page.get_by_text("发布完成", exact=False)).or_(self.page.get_by_text("定时发布成功", exact=False))
        try:
            success.first.wait_for(state="visible", timeout=60_000)
            return True
        except Exception:
            return any(value in self.page.url.lower() for value in ("success", "content/manage", "published"))

    def screenshot(self, path: str) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.page.screenshot(path=path, full_page=True)

    def _has_visible_composer(self) -> bool:
        locator = self.page.locator('[contenteditable="true"]')
        return bool(locator.count() and locator.first.is_visible())

    def _first(self, selectors: Iterable[str]):
        candidates = list(selectors)
        deadline = monotonic() + self.timeout_ms / 1000
        while monotonic() < deadline:
            report: list[dict[str, object]] = []
            for selector in candidates:
                locator = self.page.locator(selector)
                count = locator.count()
                visible = bool(count and locator.first.is_visible())
                report.append({"selector": selector, "count": count, "firstVisible": visible})
                if count and visible:
                    if self.diagnostics:
                        self.diagnostics.locator("matched", candidates, report)
                    return locator.first
            if self.diagnostics:
                self.diagnostics.locator("poll", candidates, report)
            sleep(0.1)
        if self.diagnostics:
            self.diagnostics.locator("not_found", candidates, [])
        raise RuntimeError(f"未找到可见的页面控件：{candidates}")

    def _contains_visible_text(self, candidates: Iterable[str]) -> bool:
        for text in candidates:
            locator = self.page.get_by_text(text, exact=False)
            if locator.count() and locator.first.is_visible():
                return True
        return False


class PersistentBrowserSession:
    def __init__(self, user_data_dir: str, *, headless: bool = False, diagnostics: PublishDiagnostics | None = None) -> None:
        self.user_data_dir = user_data_dir
        self.headless = headless
        self.diagnostics = diagnostics
        self.playwright: Playwright | None = None
        self.context: BrowserContext | None = None

    def start(self) -> PlaywrightPublisherPage:
        if self.context:
            page = self.context.pages[0] if self.context.pages else self.context.new_page()
            return PlaywrightPublisherPage(page, diagnostics=self.diagnostics)
        self.playwright = sync_playwright().start()
        launch_options: dict[str, object] = {
            "headless": self.headless,
            "viewport": {"width": 1440, "height": 900},
            "locale": "zh-CN",
        }
        # Explicitly selecting the installer-bundled browser prevents
        # Playwright from looking for an unbundled headless_shell.exe.
        if executable_path := resolve_bundled_chromium():
            launch_options["executable_path"] = executable_path
        self.context = self.playwright.chromium.launch_persistent_context(
            self.user_data_dir,
            **launch_options,
        )
        self._attach_diagnostics()
        if self.diagnostics:
            self.diagnostics.start_trace(self.context)
        page = self.context.pages[0] if self.context.pages else self.context.new_page()
        return PlaywrightPublisherPage(page, diagnostics=self.diagnostics)

    def close(self) -> None:
        if self.context:
            if self.diagnostics:
                self.diagnostics.stop_trace(self.context)
            self.context.close()
            self.context = None
        if self.playwright:
            self.playwright.stop()
            self.playwright = None

    def __enter__(self) -> PlaywrightPublisherPage:
        return self.start()

    def __exit__(self, exc_type, exc, traceback) -> None:
        self.close()

    def _attach_diagnostics(self) -> None:
        if not self.context or not self.diagnostics:
            return

        def attach_page(page: Page) -> None:
            page.on(
                "console",
                lambda message: self.diagnostics.console(message.type, message.text, message.location),
            )
            page.on("pageerror", lambda error: self.diagnostics.console("pageerror", str(error)))
            page.on("crash", lambda: self.diagnostics.browser_exit("page_crash", {"url": page.url}))
            page.on("close", lambda: self.diagnostics.browser_exit("page_close", {"url": page.url}))
            page.on(
                "requestfailed",
                lambda request: self.diagnostics.network_failure(
                    request.method,
                    request.url,
                    self._request_failure_text(request.failure),
                ),
            )

        for page in self.context.pages:
            attach_page(page)
        self.context.on("page", attach_page)

    @staticmethod
    def _request_failure_text(failure: Any) -> str:
        if not failure:
            return ""
        if isinstance(failure, dict):
            return str(failure.get("errorText") or failure.get("error") or failure)
        for attribute in ("error_text", "errorText"):
            value = getattr(failure, attribute, None)
            if value:
                return str(value)
        return str(failure)
