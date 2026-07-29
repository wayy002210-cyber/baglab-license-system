from fastapi.testclient import TestClient

from app.main import create_app
from app.voice.service import SynthesisResult


def test_voice_endpoints_require_key_and_return_structured_results() -> None:
    class Voice:
        def list_voices(self, *, api_key):
            assert api_key == "minimax-secret"
            return [{"voiceId": "voice-1", "name": "测试音色", "kind": "system"}]

        def synthesize(self, *, api_key, request):
            assert api_key == "minimax-secret"
            assert request.text == "欢迎光临"
            return SynthesisResult(
                audioPath="D:/cache/voice.mp3",
                cacheHit=False,
                sha256="a" * 64,
            )

    client = TestClient(create_app(session_token="secret", voice_service=Voice()))
    auth = {"X-Autocut-Token": "secret"}

    assert client.get("/voices", headers=auth).status_code == 401
    response = client.get(
        "/voices", headers={**auth, "X-MiniMax-Key": "minimax-secret"}
    )
    assert response.status_code == 200
    assert response.json()[0]["voiceId"] == "voice-1"

    response = client.post(
        "/voices/synthesize",
        headers={**auth, "X-MiniMax-Key": "minimax-secret"},
        json={"text": "欢迎光临", "voiceId": "voice-1"},
    )
    assert response.status_code == 200
    assert response.json()["audioPath"] == "D:/cache/voice.mp3"
