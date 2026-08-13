from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlsplit, urlunsplit


SENSITIVE_PAGE_MARKERS = (
    "登录",
    "验证码",
    "短信",
    "扫码",
    "二维码",
    "安全验证",
    "手机号",
    "手机",
    "passport",
    "login",
    "captcha",
)


class PublishDiagnostics:
    """Local-only diagnostic recorder for one publish attempt.

    The recorder intentionally avoids request bodies and redacts common secrets.
    Playwright trace is stored beside the job diagnostics and is not included in
    any automatic export.
    """

    def __init__(self, root_dir: str | Path, *, job_id: str, platform: str) -> None:
        self.job_id = job_id
        self.platform = platform
        self.root = Path(root_dir) / "publish-diagnostics" / job_id
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / "screenshots").mkdir(exist_ok=True)
        (self.root / "html").mkdir(exist_ok=True)
        (self.root / "aria").mkdir(exist_ok=True)
        self.trace_path = self.root / "trace.zip"
        self._trace_started = False

    def write_manifest(self, request: Any, *, build_id: str, install_root: str | None = None) -> None:
        data = {
            "jobId": self.job_id,
            "platform": self.platform,
            "buildId": build_id,
            "pythonPid": os.getpid(),
            "installRoot": install_root or os.environ.get("AUTOCUT_INSTALL_ROOT", ""),
            "createdAt": self._now(),
            "videoFileName": Path(str(getattr(request, "video_path", ""))).name,
            "hasCover": bool(
                getattr(request, "vertical_cover_path", None)
                or getattr(request, "cover_path", None)
                or getattr(request, "horizontal_cover_path", None)
            ),
            "hasVerticalCover": bool(getattr(request, "vertical_cover_path", None) or getattr(request, "cover_path", None)),
            "hasHorizontalCover": bool(getattr(request, "horizontal_cover_path", None)),
            "publishMode": "scheduled" if getattr(request, "scheduled_at", None) else "immediate",
            "diagnosticsDir": str(self.root),
            "privacy": {
                "requestBodiesCaptured": False,
                "cookiesCaptured": False,
                "authorizationCaptured": False,
                "traceExportedAutomatically": False,
            },
        }
        self._write_json(self.root / "manifest.json", data)

    def state(self, state: str, message: str, details: dict[str, Any] | None = None) -> None:
        self._append_jsonl(
            "state-events.jsonl",
            {"ts": self._now(), "state": state, "message": message, "details": self._redact(details or {})},
        )

    def locator(self, label: str, selectors: Iterable[str], matches: list[dict[str, Any]] | None = None) -> None:
        self._append_jsonl(
            "locator-report.jsonl",
            {
                "ts": self._now(),
                "label": label,
                "selectors": [self._redact_text(value) for value in selectors],
                "matches": self._redact(matches or []),
            },
        )

    def console(self, level: str, text: str, location: dict[str, Any] | None = None) -> None:
        self._append_jsonl(
            "console.jsonl",
            {"ts": self._now(), "level": level, "text": self._redact_text(text), "location": self._redact(location or {})},
        )

    def network_failure(self, method: str, url: str, error_text: str) -> None:
        self._append_jsonl(
            "network-failures.jsonl",
            {
                "ts": self._now(),
                "method": method,
                "url": self._sanitize_url(url),
                "error": self._redact_text(error_text),
            },
        )

    def browser_exit(self, reason: str, details: dict[str, Any] | None = None) -> None:
        self.state("browser_exit", reason, details or {})

    def start_trace(self, context: Any) -> None:
        if self._trace_started:
            return
        try:
            context.tracing.start(screenshots=True, snapshots=True, sources=False)
            self._trace_started = True
            self.state("trace_started", "Playwright trace 已开始本机记录")
        except Exception as error:
            self.state("trace_start_failed", "Playwright trace 启动失败", {"error": str(error)})

    def stop_trace(self, context: Any) -> None:
        if not self._trace_started:
            return
        try:
            context.tracing.stop(path=str(self.trace_path))
            self.state("trace_saved", "Playwright trace 已保存到本机", {"tracePath": str(self.trace_path)})
        except Exception as error:
            self.state("trace_stop_failed", "Playwright trace 保存失败", {"error": str(error)})
        finally:
            self._trace_started = False

    def page_state(self, page: Any, label: str) -> None:
        try:
            title = page.title()
        except Exception:
            title = ""
        details: dict[str, Any] = {
            "label": label,
            "url": self._sanitize_url(getattr(page, "url", "")),
            "title": self._redact_text(title),
        }
        try:
            details["iframeCount"] = len(page.frames)
            details["frameUrls"] = [self._sanitize_url(frame.url) for frame in page.frames[:20]]
        except Exception:
            pass
        try:
            overlays = page.locator('[role="dialog"], [aria-modal="true"], .semi-modal, .arco-modal, .modal, [class*="modal"], [class*="dialog"]')
            details["overlayCandidates"] = overlays.count()
        except Exception:
            pass
        self.state("page_state", "记录当前页面状态", details)

    def cover_probe_snapshot(self, page: Any, label: str) -> None:
        """Capture cover-dialog structure without cookies or request bodies."""
        selector = '[role="dialog"], [aria-modal="true"], [class*="modal"], [class*="dialog"], [class*="cover"]'
        controls = 'button, [role="button"], [role="tab"], input[type="file"]'
        payload: dict[str, Any] = {
            "ts": self._now(), "label": label,
            "url": self._sanitize_url(getattr(page, "url", "")),
            "overlays": [], "controls": [],
        }
        try:
            candidates = page.locator(selector)
            for index in range(min(candidates.count(), 100)):
                item = candidates.nth(index)
                if item.is_visible():
                    payload["overlays"].append({"tag": item.evaluate("el => el.tagName"), "text": item.inner_text()[:500]})
            candidates = page.locator(controls)
            for index in range(min(candidates.count(), 200)):
                item = candidates.nth(index)
                if item.is_visible() or item.get_attribute("type") == "file":
                    payload["controls"].append({
                        "tag": item.evaluate("el => el.tagName"), "role": item.get_attribute("role"),
                        "type": item.get_attribute("type"), "accept": item.get_attribute("accept"),
                        "text": item.inner_text()[:200],
                    })
        except Exception as error:
            payload["captureError"] = str(error)
        self._append_jsonl("cover-probe.jsonl", payload)
        try:
            aria = page.locator("body").aria_snapshot(timeout=5_000)
            name = f"{self._safe_name(label)}-{datetime.now().strftime('%H%M%S')}.txt"
            (self.root / "aria" / name).write_text(self._redact_text(aria), encoding="utf-8")
        except Exception as error:
            self.state("cover_probe_aria_failed", "封面ARIA结构采集失败", {"label": label, "error": str(error)})
        self.screenshot(page, f"cover-probe-{label}")
        self.html(page, f"cover-probe-{label}")

    def screenshot(self, page: Any, label: str) -> str | None:
        if self._is_sensitive_page(page):
            self.state("screenshot_skipped", "当前页面可能包含登录/验证码/二维码/手机号，已跳过截图", {"label": label})
            return None
        path = self.root / "screenshots" / f"{self._safe_name(label)}.png"
        try:
            page.screenshot(path=str(path), full_page=True)
            self.state("screenshot_saved", "关键步骤截图已保存", {"label": label, "path": str(path)})
            return str(path)
        except Exception as error:
            self.state("screenshot_failed", "关键步骤截图失败", {"label": label, "error": str(error)})
            return None

    def html(self, page: Any, label: str) -> str | None:
        if self._is_sensitive_page(page):
            self.state("html_skipped", "当前页面可能包含登录/验证码/二维码/手机号，已跳过HTML保存", {"label": label})
            return None
        path = self.root / "html" / f"{self._safe_name(label)}.html"
        try:
            path.write_text(self._redact_text(page.content()), encoding="utf-8")
            self.state("html_saved", "失败页面HTML已脱敏保存", {"label": label, "path": str(path)})
            return str(path)
        except Exception as error:
            self.state("html_failed", "失败页面HTML保存失败", {"label": label, "error": str(error)})
            return None

    def _is_sensitive_page(self, page: Any) -> bool:
        text = f"{getattr(page, 'url', '')} "
        try:
            text += page.title()
        except Exception:
            pass
        lowered = text.lower()
        return any(marker.lower() in lowered for marker in SENSITIVE_PAGE_MARKERS)

    def _append_jsonl(self, filename: str, payload: dict[str, Any]) -> None:
        with (self.root / filename).open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(self._redact(payload), ensure_ascii=False, default=str) + "\n")

    def _write_json(self, path: Path, payload: dict[str, Any]) -> None:
        path.write_text(json.dumps(self._redact(payload), ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    def _redact(self, value: Any) -> Any:
        if is_dataclass(value):
            value = asdict(value)
        if isinstance(value, dict):
            result: dict[str, Any] = {}
            for key, item in value.items():
                key_text = str(key)
                if re.search(r"(cookie|authorization|token|secret|password|apikey|api_key|key)", key_text, re.I):
                    result[key_text] = "[REDACTED]"
                else:
                    result[key_text] = self._redact(item)
            return result
        if isinstance(value, list):
            return [self._redact(item) for item in value]
        if isinstance(value, tuple):
            return [self._redact(item) for item in value]
        if isinstance(value, str):
            return self._redact_text(value)
        return value

    def _redact_text(self, value: str) -> str:
        text = value
        text = re.sub(r"(?i)(authorization|cookie|token|secret|api[_-]?key)\s*[:=]\s*[^\\s,;]+", r"\1=[REDACTED]", text)
        text = re.sub(r"(?i)bearer\s+[a-z0-9._\\-]+", "Bearer [REDACTED]", text)
        text = re.sub(r"1[3-9]\d{9}", "[REDACTED_PHONE]", text)
        text = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[REDACTED_EMAIL]", text)
        text = re.sub(r"\b\d{5,6}\b", "[REDACTED_CODE]", text)
        return text

    def _sanitize_url(self, url: str) -> str:
        if not url:
            return ""
        try:
            parts = urlsplit(url)
            return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
        except Exception:
            return self._redact_text(url.split("?")[0])

    @staticmethod
    def _safe_name(label: str) -> str:
        return re.sub(r"[^A-Za-z0-9_.-]+", "-", label).strip("-")[:80] or "step"

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()
