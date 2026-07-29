from fastapi.testclient import TestClient

from app.main import create_app


def test_gpu_encoder_endpoint_returns_detected_encoder() -> None:
    class Detector:
        def detect(self):
            return "h264_qsv"

    client = TestClient(
        create_app(session_token="secret", encoder_detector=Detector())
    )
    response = client.get(
        "/media/gpu-encoder", headers={"X-Autocut-Token": "secret"}
    )

    assert response.status_code == 200
    assert response.json() == {
        "encoder": "h264_qsv",
        "hardwareAccelerated": True,
    }
