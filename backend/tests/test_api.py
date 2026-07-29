from fastapi.testclient import TestClient

from app.main import create_app


def test_health_requires_session_token() -> None:
    client = TestClient(create_app(session_token="secret"))

    assert client.get("/health").status_code == 401
    response = client.get("/health", headers={"X-Autocut-Token": "secret"})

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "autocut-backend"}


def test_task_creation_rejects_batches_over_twenty() -> None:
    client = TestClient(create_app(session_token="secret"))

    response = client.post(
        "/tasks",
        headers={"X-Autocut-Token": "secret"},
        json={"templateId": "template-1", "personaId": "persona-1", "count": 21},
    )

    assert response.status_code == 422
