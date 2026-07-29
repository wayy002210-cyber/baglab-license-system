from fastapi.testclient import TestClient

from app.main import create_app
from app.media.asset_scanner import ScanResult, ScannedAsset
from app.copywriting.service import RewriteResult


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


def test_asset_scan_returns_structured_probe_results(tmp_path) -> None:
    class Scanner:
        def scan(self, root):
            assert root == tmp_path
            return ScanResult(
                root_path=str(tmp_path),
                unsupported_count=0,
                assets=[
                    ScannedAsset(
                        file_name="one.mp4",
                        file_path=str(tmp_path / "one.mp4"),
                        duration_sec=2.5,
                        width=1080,
                        height=1920,
                        fps=30,
                        codec="h264",
                        file_size=100,
                        fingerprint="abc",
                        status="ready",
                    )
                ],
            )

    client = TestClient(create_app(session_token="secret", asset_scanner=Scanner()))

    response = client.post(
        "/assets/scan",
        headers={"X-Autocut-Token": "secret"},
        json={"folderPath": str(tmp_path)},
    )

    assert response.status_code == 200
    assert response.json()["assets"][0]["duration_sec"] == 2.5


def test_copywriting_rewrite_requires_bailian_key() -> None:
    class Copywriting:
        def rewrite(self, *, api_key, model, request):
            assert api_key == "bailian-secret"
            assert model == "qwen-plus"
            return RewriteResult(
                shots=[
                    {
                        "index": 0,
                        "role": "hook",
                        "assetCategoryId": "people",
                        "copywriting": "十年工厂经验，帮你少走弯路。",
                        "durationMode": "voice",
                        "muteOriginal": True,
                    }
                ]
            )

    client = TestClient(
        create_app(session_token="secret", copywriting_service=Copywriting())
    )
    payload = {
        "sourceText": "我们有十年工厂经验。",
        "personaName": "袋研官",
        "brandFacts": ["十年经验"],
        "tone": "专业直接",
        "cta": "关注我",
        "bannedWords": [],
        "shots": [{"index": 0, "role": "hook", "assetCategoryId": "people"}],
    }

    assert (
        client.post(
            "/copywriting/rewrite",
            headers={"X-Autocut-Token": "secret"},
            json=payload,
        ).status_code
        == 401
    )
    response = client.post(
        "/copywriting/rewrite",
        headers={
            "X-Autocut-Token": "secret",
            "X-Bailian-Key": "bailian-secret",
        },
        json=payload,
    )

    assert response.status_code == 200
    assert response.json()["shots"][0]["copywriting"] == "十年工厂经验，帮你少走弯路。"
