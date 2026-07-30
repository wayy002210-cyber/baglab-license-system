from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.voice.service import SynthesisResult
from app.voice.cloning import CloneResult, SampleMetadata


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


def test_voice_clone_endpoints_validate_and_clone_a_sample() -> None:
    class Cloner:
        def validate_sample(self, path):
            assert Path(path).as_posix() == "D:/voice/sample.wav"
            return SampleMetadata(
                path=str(path),
                durationSec=20,
                format="wav",
                sizeBytes=1024,
            )

        def clone(self, *, api_key, request):
            assert api_key == "minimax-secret"
            return CloneResult(
                voiceId=request.voice_id,
                status="ready",
                demoAudio="https://example.com/demo.mp3",
                sample=self.validate_sample(Path(request.sample_path)),
            )

        def get(self, voice_id):
            return None

    client = TestClient(
        create_app(session_token="secret", voice_clone_service=Cloner())
    )
    auth = {"X-Autocut-Token": "secret"}
    validation = client.post(
        "/voices/sample/validate",
        headers=auth,
        json={"samplePath": "D:/voice/sample.wav"},
    )
    assert validation.status_code == 200
    assert validation.json()["durationSec"] == 20

    payload = {
        "samplePath": "D:/voice/sample.wav",
        "voiceId": "BagLabVoice01",
        "previewText": "试听",
        "model": "speech-2.8-hd",
    }
    assert client.post(
        "/voices/clones", headers=auth, json=payload
    ).status_code == 401
    cloned = client.post(
        "/voices/clones",
        headers={**auth, "X-MiniMax-Key": "minimax-secret"},
        json=payload,
    )
    assert cloned.status_code == 200
    assert cloned.json()["voiceId"] == "BagLabVoice01"


def test_voice_capabilities_match_the_supported_minimax_contract() -> None:
    client = TestClient(create_app(session_token="secret"))
    response = client.get(
        "/voices/capabilities",
        headers={"X-Autocut-Token": "secret"},
    )

    assert response.status_code == 200
    body = response.json()
    assert "speech-2.8-hd" in body["models"]
    assert "happy" in body["emotions"]
    assert body["speedRange"] == [0.5, 2.0]
    assert body["sample"]["formats"] == ["mp3", "m4a", "wav"]


def test_minimax_connection_uses_voice_listing_without_generating_billable_audio() -> None:
    class Voice:
        def list_voices(self, *, api_key):
            assert api_key == "minimax-secret"
            return [{"voiceId": "voice-1", "name": "测试音色", "kind": "system"}]

        def synthesize(self, *, api_key, request):
            raise AssertionError("connection test must not synthesize audio")

    client = TestClient(create_app(session_token="secret", voice_service=Voice()))
    auth = {"X-Autocut-Token": "secret"}

    assert client.get("/voices/connection", headers=auth).status_code == 401
    response = client.get(
        "/voices/connection",
        headers={**auth, "X-MiniMax-Key": "minimax-secret"},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "connected", "voiceCount": 1}
