from pathlib import Path

from app.publisher.adapters import DouyinPublisher, PublishRequest, XiaohongshuPublisher


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
    )


def test_douyin_publisher_uses_semantic_fallback_selectors(tmp_path: Path) -> None:
    page = FakePage()
    result = DouyinPublisher().publish(page, request(tmp_path))

    assert result.status == "published"
    assert page.actions[0][0] == "upload"
    assert "input[type=file]" in page.actions[0][1]
    assert any(action[0] == "fill" and "#工厂" in action[2] for action in page.actions)


def test_xiaohongshu_publisher_requires_user_on_challenge(tmp_path: Path) -> None:
    page = FakePage(challenge=True)
    result = XiaohongshuPublisher().publish(page, request(tmp_path))

    assert result.status == "needs_user"
    assert result.current_url == page.url
    assert result.screenshot_path is not None
    assert any(action[0] == "screenshot" for action in page.actions)


def test_expired_login_is_not_reported_as_publish_failure(tmp_path: Path) -> None:
    result = DouyinPublisher().publish(FakePage(login=True), request(tmp_path))

    assert result.status == "needs_user"
    assert result.error_code == "LOGIN_REQUIRED"
