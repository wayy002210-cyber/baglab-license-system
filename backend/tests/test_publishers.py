from pathlib import Path

from app.publisher.agent import AgentRecord, BrowserAgentManager
from app.publisher.adapters import DouyinPublisher, PublishCancellation, PublishRequest, WechatChannelsPublisher
from app.publisher.diagnostics import PublishDiagnostics
from app.publisher.service import PublishingService


class FakePage:
    def __init__(self, *, challenge: bool = False, login: bool = False):
        self.challenge, self.login, self.actions = challenge, login, []
        self.current_url = "https://creator.example/upload"

    def is_login_required(self): return self.login
    def has_human_challenge(self): return self.challenge
    def upload(self, selectors, path): self.actions.append(("upload", selectors, path))
    def wait_for_upload_ready(self): self.actions.append(("wait_upload",)); return True
    def upload_cover(self, trigger_selectors, input_selectors, path): self.actions.append(("upload_cover", trigger_selectors, input_selectors, path))
    def upload_cover_assets(self, trigger_selectors, input_selectors, vertical_cover_path, horizontal_cover_path, *, supports_dual_cover):
        self.actions.append(("upload_cover_assets", trigger_selectors, input_selectors, vertical_cover_path, horizontal_cover_path, supports_dual_cover))
    def fill(self, selectors, value): self.actions.append(("fill", selectors, value))
    def fill_douyin_metadata(self, title_selectors, description_selectors, title, description, topics): self.actions.append(("douyin_metadata", title_selectors, description_selectors, title, description, topics))
    def set_schedule(self, toggle_selectors, date_selectors, time_selectors, value): self.actions.append(("schedule", toggle_selectors, date_selectors, time_selectors, value))
    def click(self, selectors): self.actions.append(("click", selectors))
    def wait_for_publish_success(self): return True
    def screenshot(self, path): self.actions.append(("screenshot", path))

    @property
    def url(self): return self.current_url


def request(tmp_path: Path, *, cover: bool = False, vertical_cover: bool = False, horizontal_cover: bool = False) -> PublishRequest:
    return PublishRequest(
        videoPath=str(tmp_path / "video.mp4"),
        title="工厂实拍",
        description="每一个细节都认真把关。",
        topics=["工厂", "定制"],
        coverPath=str(tmp_path / "cover.jpg") if cover else None,
        verticalCoverPath=str(tmp_path / "vertical.jpg") if vertical_cover else None,
        horizontalCoverPath=str(tmp_path / "horizontal.jpg") if horizontal_cover else None,
        screenshotDir=str(tmp_path),
        scheduledAt="2026-08-04T20:30:00+08:00",
    )


def test_douyin_fills_title_and_hashtags_without_full_script(tmp_path: Path) -> None:
    page = FakePage()
    result = DouyinPublisher().publish(page, request(tmp_path))
    assert result.status == "published"
    metadata = next(item for item in page.actions if item[0] == "douyin_metadata")
    assert metadata[3] == "工厂实拍"
    assert metadata[4] == ""
    assert metadata[5] == ["工厂", "定制"]
    assert any(action[0] == "schedule" for action in page.actions)


def test_douyin_fills_metadata_while_video_is_uploading_then_waits_before_cover(tmp_path: Path) -> None:
    page = FakePage()

    result = DouyinPublisher().publish(page, request(tmp_path, vertical_cover=True))

    assert result.status == "published"
    action_names = [action[0] for action in page.actions]
    assert action_names.index("upload") < action_names.index("douyin_metadata")
    assert action_names.index("douyin_metadata") < action_names.index("wait_upload")
    assert action_names.index("wait_upload") < action_names.index("upload_cover_assets")


def test_douyin_uploads_cover_after_opening_cover_flow(tmp_path: Path) -> None:
    page = FakePage()
    result = DouyinPublisher().publish(page, request(tmp_path, cover=True))
    assert result.status == "published"
    cover = next(item for item in page.actions if item[0] == "upload_cover_assets")
    assert cover[1] == DouyinPublisher.cover_trigger_selectors
    assert cover[3].endswith("cover.jpg")
    assert cover[4] is None
    assert cover[5] is True


def test_douyin_passes_vertical_and_horizontal_cover_to_dual_cover_flow(tmp_path: Path) -> None:
    page = FakePage()
    result = DouyinPublisher().publish(page, request(tmp_path, vertical_cover=True, horizontal_cover=True))
    assert result.status == "published"
    cover = next(item for item in page.actions if item[0] == "upload_cover_assets")
    assert cover[3].endswith("vertical.jpg")
    assert cover[4].endswith("horizontal.jpg")
    assert cover[5] is True


def test_cover_probe_flag_does_not_interrupt_normal_publish(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("AUTOCUT_COVER_PROBE", "1")
    page = FakePage()

    result = DouyinPublisher().publish(page, request(tmp_path, vertical_cover=True))

    assert result.status == "published"
    assert any(action[0] == "upload_cover_assets" for action in page.actions)
    assert any(action[0] == "click" for action in page.actions)


def test_single_cover_platform_prefers_vertical_then_horizontal(tmp_path: Path) -> None:
    page = FakePage()
    result = WechatChannelsPublisher().publish(page, request(tmp_path, horizontal_cover=True))
    assert result.status == "published"
    cover = next(item for item in page.actions if item[0] == "upload_cover_assets")
    assert cover[3] is None
    assert cover[4].endswith("horizontal.jpg")
    assert cover[5] is False


def test_challenge_requests_human_takeover(tmp_path: Path) -> None:
    result = WechatChannelsPublisher().publish(FakePage(challenge=True), request(tmp_path))
    assert result.status == "needs_user"
    assert result.error_code == "HUMAN_CHALLENGE"


def test_expired_login_requests_human_takeover(tmp_path: Path) -> None:
    result = DouyinPublisher().publish(FakePage(login=True), request(tmp_path))
    assert result.status == "needs_user"
    assert result.error_code == "LOGIN_REQUIRED"


def test_selector_failure_is_not_misreported_as_human_takeover(tmp_path: Path) -> None:
    class ChangedPage(FakePage):
        def fill_douyin_metadata(self, *args): raise RuntimeError("No matching visible selector")

    result = DouyinPublisher().publish(ChangedPage(), request(tmp_path))
    assert result.status == "failed"
    assert result.error_code == "AUTOMATION_STEP_FAILED"
    assert "填写标题与话题失败" in result.error_message


def test_failure_keeps_original_error_when_browser_screenshot_is_unavailable(tmp_path: Path) -> None:
    class ClosedPage(FakePage):
        def fill_douyin_metadata(self, *args):
            raise RuntimeError("平台时间设置失败：目标值未生效")

        def screenshot(self, _path):
            raise RuntimeError("Target page has been closed")

    result = DouyinPublisher().publish(ClosedPage(), request(tmp_path))

    assert result.status == "failed"
    assert "平台时间设置失败：目标值未生效" in result.error_message
    assert result.screenshot_path is None


def test_cancel_before_submit_never_clicks_publish(tmp_path: Path) -> None:
    page, cancellation = FakePage(), PublishCancellation()
    cancellation.cancel()
    result = DouyinPublisher().publish(page, request(tmp_path), cancellation=cancellation)
    assert result.status == "canceled"
    assert not any(action[0] == "click" for action in page.actions)


def test_cancel_is_rejected_after_submission_begins() -> None:
    cancellation = PublishCancellation(); cancellation.mark_submitted()
    assert cancellation.cancel() is False


class FakeSession:
    def __init__(self, page): self.page = page
    def __enter__(self): return self.page
    def __exit__(self, exc_type, exc, traceback): return None


def test_service_remembers_cancel_before_publish(tmp_path: Path) -> None:
    page = FakePage(); service = PublishingService(session_factory=lambda _directory: FakeSession(page))
    assert service.cancel("job-before-start") is True
    result = service.publish(job_id="job-before-start", platform="douyin", user_data_dir="D:/profile", request=request(tmp_path))
    assert result.status == "canceled"
    assert not any(action[0] == "click" for action in page.actions)


def test_service_rejects_invalid_video_before_opening_browser(tmp_path: Path) -> None:
    opened = False

    def session_factory(_directory):
        nonlocal opened; opened = True
        return FakeSession(FakePage())

    service = PublishingService(session_factory=session_factory, media_validator=lambda _path: False)
    result = service.publish(job_id="invalid-video", platform="douyin", user_data_dir="D:/profile", request=request(tmp_path))
    assert result.status == "failed"
    assert result.error_code == "INVALID_VIDEO"
    assert opened is False


def test_browser_agent_start_is_idempotent_for_same_running_job(tmp_path: Path) -> None:
    manager = BrowserAgentManager(media_validator=lambda _path: True)
    spawn_calls: list[str] = []

    def fake_spawn(record: AgentRecord, *, resume: bool) -> None:
        spawn_calls.append(record.job_id)

    manager._spawn = fake_spawn  # type: ignore[method-assign]

    first = manager.start(job_id="job-dup", platform="douyin", user_data_dir="D:/profile", request=request(tmp_path))
    second = manager.start(job_id="job-dup", platform="douyin", user_data_dir="D:/profile", request=request(tmp_path))

    assert spawn_calls == ["job-dup"]
    assert first["sessionId"] == second["sessionId"]


def test_browser_agent_transition_writes_diagnostic_event(tmp_path: Path) -> None:
    manager = BrowserAgentManager(media_validator=lambda _path: True)
    record = AgentRecord(
        job_id="job-diagnostics",
        platform="douyin",
        user_data_dir="D:/profile",
        request=request(tmp_path),
        diagnostics=PublishDiagnostics(tmp_path, job_id="job-diagnostics", platform="douyin"),
    )

    manager._transition(record, "checking_login", "检查登录状态")

    events = (tmp_path / "publish-diagnostics" / "job-diagnostics" / "state-events.jsonl").read_text(encoding="utf-8")
    assert "checking_login" in events
    assert "检查登录状态" in events
