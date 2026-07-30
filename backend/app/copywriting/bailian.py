from __future__ import annotations

import httpx


class BailianAPIError(RuntimeError):
    def __init__(self, message: str, *, code: str, status_code: int) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class BailianAuthenticationError(BailianAPIError):
    pass


def supports_json_object(model: str) -> bool:
    return bool(model.strip())


class BailianChat:
    endpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"

    def __init__(self, timeout: float = 60.0) -> None:
        self.timeout = timeout

    def complete(self, *, api_key: str, model: str, prompt: str) -> str:
        payload: dict[str, object] = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.4,
        }
        if supports_json_object(model):
            payload["response_format"] = {"type": "json_object"}
        response = httpx.post(
            self.endpoint,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=self.timeout,
        )
        if response.status_code == 401:
            raise BailianAuthenticationError(
                "百炼 API Key 无效或已失效，请在系统设置中重新填写并测试连接",
                code="BAILIAN_INVALID_KEY",
                status_code=401,
            )
        if response.status_code == 403:
            raise BailianAPIError(
                f"当前账号无权使用模型 {model}，请检查模型权限或更换模型",
                code="BAILIAN_MODEL_FORBIDDEN",
                status_code=403,
            )
        if response.status_code == 429:
            raise BailianAPIError(
                "百炼请求过于频繁，请稍后重试",
                code="BAILIAN_RATE_LIMITED",
                status_code=429,
            )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as error:
            raise BailianAPIError(
                f"百炼服务请求失败（HTTP {response.status_code}）",
                code="BAILIAN_REQUEST_FAILED",
                status_code=response.status_code,
            ) from error
        data = response.json()
        try:
            return str(data["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError) as error:
            raise RuntimeError("Bailian returned an unexpected response") from error
