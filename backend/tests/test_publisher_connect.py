from contextlib import contextmanager

from app.publisher.service import PublishingService


class RawPage:
    def __init__(self) -> None:
        self.url = ""
        self.waits = 0

    def goto(self, url, wait_until):
        self.url = url

    def wait_for_timeout(self, _milliseconds):
        self.waits += 1


class Page:
    def __init__(self) -> None:
        self.page = RawPage()

    def has_human_challenge(self):
        return False

    def is_login_required(self):
        return self.page.waits < 2


def test_connect_account_keeps_browser_open_until_login_finishes() -> None:
    page = Page()

    @contextmanager
    def session_factory(_directory):
        yield page

    service = PublishingService(session_factory=session_factory)
    status = service.connect_account(
        platform="douyin",
        user_data_dir="D:/profile",
        max_wait_ms=5_000,
        poll_interval_ms=10,
    )

    assert status == "connected"
    assert page.page.waits == 2
