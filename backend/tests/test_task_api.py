from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.main import create_app
from app.tasks.worker import TaskEvent


class Runtime:
    def __init__(self) -> None:
        self.started = None
        self.canceled = None
        self.retried = None

    async def start(self, request):
        self.started = request

    def latest(self, task_id):
        return TaskEvent(
            taskId=task_id,
            status="encoding",
            progress=80,
            stage="encoding",
            createdAt=datetime.now(timezone.utc).isoformat(),
        )

    def cancel(self, task_id):
        self.canceled = task_id

    async def retry(self, task_id):
        self.retried = task_id

    async def stream(self, task_id, cursor=0):
        events = [
            TaskEvent(
                taskId=task_id,
                status="encoding",
                progress=80,
                stage="encoding",
                createdAt="2026-01-01T00:00:00+00:00",
            ),
            TaskEvent(
                taskId=task_id,
                status="completed",
                progress=100,
                stage="encoding",
                createdAt="2026-01-01T00:00:01+00:00",
            ),
        ]
        for index, event in enumerate(events[cursor:], start=cursor + 1):
            yield index, event


def test_task_run_status_cancel_and_retry_endpoints() -> None:
    runtime = Runtime()
    client = TestClient(create_app(session_token="secret", task_runtime=runtime))
    headers = {"X-Autocut-Token": "secret"}
    payload = {
        "taskId": "task-1",
        "seed": 10,
        "snapshot": {},
        "outputPath": "D:/out.mp4",
    }

    response = client.post("/tasks/task-1/run", headers=headers, json=payload)
    assert response.status_code == 202
    assert runtime.started.task_id == "task-1"

    response = client.get("/tasks/task-1", headers=headers)
    assert response.json()["status"] == "encoding"

    assert client.post("/tasks/task-1/cancel", headers=headers).status_code == 202
    assert runtime.canceled == "task-1"
    assert client.post("/tasks/task-1/retry", headers=headers).status_code == 202
    assert runtime.retried == "task-1"


def test_task_events_are_sse_and_resume_after_last_event_id() -> None:
    client = TestClient(
        create_app(session_token="secret", task_runtime=Runtime())
    )
    response = client.get(
        "/tasks/task-1/events",
        headers={"X-Autocut-Token": "secret", "Last-Event-ID": "1"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "id: 2" in response.text
    assert '"status":"completed"' in response.text
    assert '"status":"encoding"' not in response.text
