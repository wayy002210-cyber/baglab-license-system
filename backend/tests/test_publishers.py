from pathlib import Path

from app.publisher.adapters import (
    DouyinPublisher,
    PublishCancellation,
    PublishRequest,
    WechatChannelsPublisher,
)
from app.publisher.service import PublishingService


class FakePage:
    def __init__(self, *, challenge=False, login=False):
        self.challenge = challenge
        self.login = login
        self.actions = []
        self.current_url = "https://creator.example/upload"

    def is_login_required(self): return self.login
    def has_human_challenge(self): return self.challenge
    def upload(self, selectors, path): self.actions.append(("upload", selectors, path))
    def fill(self, selectors, value): self.actions.append(("fill", selectors, value))
    def set_schedule(self, toggle_selectors, date_selectors, time_selectors, value):
        self.actions.append(("schedule", toggle_selectors, date_selectors, time_selectors, value))
    def click(self, selectors): self.actions.append(("click", selectors))
    def wait_for_publish_success(self): return True
    def screenshot(self, path): self.actions.append(("screenshot", path))
    @property
    def url(self): return self.current_url


def request(tmp_path):
    return PublishRequest(
        videoPath=str(tmp_path / "video.mp4"),
        title="工厂实拍",
        topics=["工厂", "定制"],
        screenshotDir=str(tmp_path),
        scheduledAt="2026-08-04T20:30:00+08:00",
    )


def test_douyin_publisher_uses_semantic_fallback_selectors(tmp_path: Path) -> None:
    page = FakePage()
    result = DouyinPublisher().publish(page, request(tmp_path))

    assert result.status == "published"
    assert page.actions[0][0] == "upload"
    assert "input[type=file]" in page.actions[0][1]
    assert any(action[0] == "fill" and "#工厂" in action[2] for action in page.actions)
    assert any(action[0] == "schedule" and action[4].isoformat() == "2026-08-04T20:30:00+08:00" for action in page.actions)


def test_wechat_channels_publisher_requires_user_on_challenge(tmp_path: Path) -> None:
    page = FakePage(challenge=True)
    result = WechatChannelsPublisher().publish(page, request(tmp_path))

    assert result.status == "needs_user"
    assert result.current_url == page.url
    assert result.screenshot_path is not None
    assert any(action[0] == "screenshot" for action in page.actions)


def test_expired_login_is_not_reported_as_publish_failure(tmp_path: Path) -> None:
    result = DouyinPublisher().publish(FakePage(login=True), request(tmp_path))

    assert result.status == "needs_user"
    assert result.error_code == "LOGIN_REQUIRED"


def test_page_structure_change_requests_user_takeover(tmp_path: Path) -> None:
    class ChangedPage(FakePage):
        def fill(self, selectors, value):
            raise RuntimeError("No matching visible selector")

    result = DouyinPublisher().publish(ChangedPage(), request(tmp_path))

    assert result.status == "needs_user"
    assert result.error_code == "PAGE_CHANGED"


def test_cancel_before_submit_never_clicks_publish(tmp_path: Path) -> None:
    page = FakePage()
    cancellation = PublishCancellation()
    cancellation.cancel()

    result = DouyinPublisher().publish(
        page,
        request(tmp_path),
        cancellation=cancellation,
    )

    assert result.status == "canceled"
    assert not any(action[0] == "click" for action in page.actions)


def test_cancel_is_rejected_after_submission_begins() -> None:
    cancellation = PublishCancellation()

    cancellation.mark_submitted()

    assert cancellation.cancel() is False


class FakeSession:
    def __init__(self, page):
        self.page = page

    def __enter__(self):
        return self.page

    def __exit__(self, exc_type, exc, traceback):
        return None


def test_service_remembers_cancel_that_arrives_before_publish(
    tmp_path: Path,
) -> None:
    page = FakePage()
    service = PublishingService(session_factory=lambda _directory: FakeSession(page))

    assert service.cancel("job-before-start") is True
    result = service.publish(
        job_id="job-before-start",
        platform="douyin",
        user_data_dir="D:/profile",
        request=request(tmp_path),
    )

    assert result.status == "canceled"
    assert not any(action[0] == "click" for action in page.actions)


def test_service_rejects_invalid_video_before_opening_browser(
    tmp_path: Path,
) -> None:
    opened = False

    def session_factory(_directory):
        nonlocal opened
        opened = True
        return FakeSession(FakePage())

    service = PublishingService(
        session_factory=session_factory,
        media_validator=lambda _path: False,
    )
    result = service.publish(
        job_id="invalid-video",
        platform="douyin",
        user_data_dir="D:/profile",
        request=request(tmp_path),
    )

    assert result.status == "failed"
    assert result.error_code == "INVALID_VIDEO"
    assert "无法播放" in result.error_message
    assert opened is False
