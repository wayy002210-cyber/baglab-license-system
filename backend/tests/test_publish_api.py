from fastapi.testclient import TestClient

from app.main import create_app
from app.publisher.adapters import PublishResult


class Publishing:
    def check_account(self, **kwargs):
        return "connected"

    def publish(self, **kwargs):
        return PublishResult(status="published", currentUrl="https://success")


def test_publish_account_check_and_job_run() -> None:
    client = TestClient(
        create_app(session_token="secret", publishing_service=Publishing())
    )
    headers = {"X-Autocut-Token": "secret"}
    check = client.post(
        "/publish/accounts/account-1/check",
        headers=headers,
        json={"platform": "douyin", "userDataDir": "D:/profile"},
    )
    run = client.post(
        "/publish/jobs/job-1/run",
        headers=headers,
        json={
            "platform": "douyin",
            "userDataDir": "D:/profile",
            "videoPath": "D:/video.mp4",
            "title": "标题",
            "topics": ["工厂"],
            "screenshotDir": "D:/logs",
        },
    )

    assert check.json()["status"] == "connected"
    assert run.json()["status"] == "published"
