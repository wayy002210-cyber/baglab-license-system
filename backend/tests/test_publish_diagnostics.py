from __future__ import annotations

from pathlib import Path

from app.publisher.adapters import PublishRequest
from app.publisher.diagnostics import PublishDiagnostics


def _request(tmp_path: Path) -> PublishRequest:
    video = tmp_path / "video.mp4"
    cover = tmp_path / "cover.jpg"
    video.write_bytes(b"fake")
    cover.write_bytes(b"fake")
    return PublishRequest(
        videoPath=str(video),
        title="诊断测试标题",
        description="手机号 13812345678 验证码 123456 Authorization: Bearer abc",
        topics=["袋研官"],
        coverPath=str(cover),
        screenshotDir=str(tmp_path),
        scheduledAt=None,
    )


def test_publish_diagnostics_redacts_sensitive_values(tmp_path: Path) -> None:
    diagnostics = PublishDiagnostics(tmp_path, job_id="job-1", platform="douyin")

    diagnostics.write_manifest(_request(tmp_path), build_id="diag-test", install_root="C:/install")
    diagnostics.state(
        "checking_login",
        "手机 13812345678 验证码 123456",
        {"Authorization": "Bearer secret", "token": "abc", "normal": "ok"},
    )
    diagnostics.locator("poll", ['[data-token="abc"]'], [{"selector": "a", "count": 1}])
    diagnostics.console("error", "token=abc Authorization: Bearer secret 13812345678")
    diagnostics.network_failure("POST", "https://example.test/path?token=abc", "Bearer secret")

    root = tmp_path / "publish-diagnostics" / "job-1"
    assert (root / "manifest.json").exists()
    assert (root / "state-events.jsonl").exists()
    assert (root / "locator-report.jsonl").exists()
    assert (root / "console.jsonl").exists()
    assert (root / "network-failures.jsonl").exists()

    combined = "\n".join(path.read_text(encoding="utf-8") for path in root.glob("*.json*"))
    assert "13812345678" not in combined
    assert "123456" not in combined
    assert "Bearer secret" not in combined
    assert "token=abc" not in combined
    assert "[REDACTED_PHONE]" in combined
    assert "[REDACTED_CODE]" in combined
    assert "[REDACTED]" in combined
    assert "https://example.test/path?token=abc" not in combined
    assert "https://example.test/path" in combined


def test_sensitive_page_skips_screenshot_and_html(tmp_path: Path) -> None:
    class SensitivePage:
        url = "https://passport.douyin.com/login"
        frames = []

        def title(self) -> str:
            return "短信验证码登录"

        def screenshot(self, *args, **kwargs) -> None:
            raise AssertionError("sensitive page must not be screenshotted")

        def content(self) -> str:
            raise AssertionError("sensitive page HTML must not be captured")

    diagnostics = PublishDiagnostics(tmp_path, job_id="job-2", platform="douyin")

    assert diagnostics.screenshot(SensitivePage(), "login") is None
    assert diagnostics.html(SensitivePage(), "login") is None

    events = (tmp_path / "publish-diagnostics" / "job-2" / "state-events.jsonl").read_text(encoding="utf-8")
    assert "screenshot_skipped" in events
    assert "html_skipped" in events
