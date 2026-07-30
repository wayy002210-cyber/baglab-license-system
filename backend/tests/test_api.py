from fastapi.testclient import TestClient

from app.main import create_app
from app.media.asset_scanner import ScanResult, ScannedAsset
from app.copywriting.service import RewriteResult
from app.copywriting.compliance import ComplianceResult
from app.copywriting.topic_service import CopywritingResult, TopicResult
from app.copywriting.bailian import BailianAuthenticationError


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
            assert model == "deepseek-v3"
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


def test_content_creation_endpoints_use_selected_bailian_model() -> None:
    class ContentCreation:
        def generate_topics(self, *, api_key, request):
            assert api_key == "bailian-secret"
            assert request.model == "deepseek-v3"
            return TopicResult(
                topics=[
                    {
                        "id": str(index),
                        "title": f"选题{index}",
                        "angle": f"角度{index}",
                        "hook": f"钩子{index}",
                    }
                    for index in range(5)
                ]
            )

        def generate_copywriting(self, *, api_key, request):
            assert api_key == "bailian-secret"
            return CopywritingResult(text="工" * 220)

        def check_compliance(self, request):
            return ComplianceResult(
                originalText=request.text,
                issues=[],
                disclaimer="风险提示仅用于内容检查，不构成法律结论。",
            )

    client = TestClient(
        create_app(
            session_token="secret",
            content_creation_service=ContentCreation(),
        )
    )
    headers = {
        "X-Autocut-Token": "secret",
        "X-Bailian-Key": "bailian-secret",
    }
    topic_payload = {
        "model": "deepseek-v3",
        "personaName": "袋研官",
        "industry": "工厂",
        "brandFacts": ["自有工厂"],
        "tone": "专业",
        "cta": "欢迎咨询",
        "referenceScripts": [],
    }

    assert client.post(
        "/copywriting/topics",
        headers={"X-Autocut-Token": "secret"},
        json=topic_payload,
    ).status_code == 401
    topics = client.post(
        "/copywriting/topics", headers=headers, json=topic_payload
    )
    assert topics.status_code == 200
    assert len(topics.json()["topics"]) == 5

    generated = client.post(
        "/copywriting/generate",
        headers=headers,
        json={
            **topic_payload,
            "topic": "工厂获客",
            "bannedWords": [],
            "minLength": 200,
            "maxLength": 1000,
        },
    )
    assert generated.status_code == 200
    assert len(generated.json()["text"]) == 220

    compliance = client.post(
        "/copywriting/compliance",
        headers={"X-Autocut-Token": "secret"},
        json={"text": "普通文案", "personaBannedWords": []},
    )
    assert compliance.status_code == 200


def test_topics_exposes_invalid_bailian_key_as_actionable_401() -> None:
    class ContentCreation:
        def generate_topics(self, *, api_key, request):
            raise BailianAuthenticationError(
                "百炼 API Key 无效或已失效，请在系统设置中重新填写并测试连接",
                code="BAILIAN_INVALID_KEY",
                status_code=401,
            )

        def generate_copywriting(self, *, api_key, request):
            raise AssertionError("not called")

        def check_compliance(self, request):
            raise AssertionError("not called")

    client = TestClient(
        create_app(
            session_token="secret",
            content_creation_service=ContentCreation(),
        )
    )
    response = client.post(
        "/copywriting/topics",
        headers={
            "X-Autocut-Token": "secret",
            "X-Bailian-Key": "invalid",
        },
        json={
            "model": "deepseek-v3",
            "personaName": "袋研官",
            "industry": "工厂",
            "brandFacts": [],
            "referenceScripts": [],
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "BAILIAN_INVALID_KEY"
