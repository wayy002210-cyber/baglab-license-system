from __future__ import annotations

import math
from dataclasses import dataclass

import httpx


class BailianAPIError(RuntimeError):
    def __init__(self, message: str, *, code: str, status_code: int) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class BailianAuthenticationError(BailianAPIError):
    pass


@dataclass(frozen=True)
class SearchSource:
    title: str
    url: str
    site_name: str
    published_at: str | None = None
    snippet: str = ""


@dataclass(frozen=True)
class SearchResponse:
    content: str
    sources: list[SearchSource]


def supports_json_object(model: str) -> bool:
    return bool(model.strip())


class BailianChat:
    endpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    embedding_endpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings"
    search_endpoint = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation"

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
        self._raise_for_status(response, model=model)
        data = response.json()
        try:
            return str(data["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError) as error:
            raise RuntimeError("Bailian returned an unexpected response") from error

    def embed(
        self,
        *,
        api_key: str,
        texts: list[str],
        model: str = "text-embedding-v3",
        dimensions: int = 256,
    ) -> list[list[float]]:
        if not texts:
            return []
        vectors: list[list[float]] = []
        for start in range(0, len(texts), 10):
            batch = texts[start:start + 10]
            try:
                response = httpx.post(
                    self.embedding_endpoint,
                    headers=self._headers(api_key),
                    json={
                        "model": model,
                        "input": batch,
                        "dimensions": dimensions,
                        "encoding_format": "float",
                    },
                    timeout=self.timeout,
                )
                self._raise_for_status(response, model=model)
                items = sorted(response.json()["data"], key=lambda item: item["index"])
                batch_vectors = [[float(value) for value in item["embedding"]] for item in items]
                if len(batch_vectors) != len(batch):
                    raise ValueError("embedding count mismatch")
                if any(
                    len(vector) != dimensions or not all(math.isfinite(value) for value in vector)
                    for vector in batch_vectors
                ):
                    raise ValueError("invalid embedding vector")
                vectors.extend(batch_vectors)
            except BailianAuthenticationError:
                raise
            except (BailianAPIError, httpx.HTTPError, KeyError, TypeError, ValueError) as error:
                raise BailianAPIError(
                    "百炼语义向量暂时不可用，已改用本地文字判重",
                    code="BAILIAN_EMBEDDING_UNAVAILABLE",
                    status_code=getattr(error, "status_code", 503),
                ) from error
        return vectors

    def search(self, *, api_key: str, model: str, prompt: str) -> SearchResponse:
        payload = {
            "model": model,
            "input": {"messages": [{"role": "user", "content": prompt}]},
            "parameters": {
                "result_format": "message",
                "enable_search": True,
                "search_options": {
                    "forced_search": True,
                    "enable_source": True,
                    "enable_citation": False,
                },
            },
        }
        try:
            response = httpx.post(
                self.search_endpoint,
                headers=self._headers(api_key),
                json=payload,
                timeout=self.timeout,
            )
            self._raise_for_status(response, model=model)
            data = response.json()
            output = data["output"]
            content = output.get("text")
            if content is None:
                content = output["choices"][0]["message"]["content"]
            search_info = output.get("search_info", {})
            raw_sources = search_info.get("search_results", [])
            sources = [
                SearchSource(
                    title=str(item.get("title", ""))[:300],
                    url=str(item.get("url", ""))[:2000],
                    site_name=str(item.get("site_name", ""))[:200],
                    published_at=str(
                        item.get("published_at") or item.get("publish_time")
                        or item.get("date") or ""
                    )[:40] or None,
                    snippet=str(item.get("snippet") or item.get("summary") or "")[:1000],
                )
                for item in raw_sources
                if item.get("url")
            ]
            return SearchResponse(content=str(content), sources=sources)
        except BailianAuthenticationError:
            raise
        except (BailianAPIError, httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as error:
            raise BailianAPIError(
                "百炼联网搜索暂时不可用",
                code="BAILIAN_SEARCH_UNAVAILABLE",
                status_code=getattr(error, "status_code", 503),
            ) from error

    @staticmethod
    def _headers(api_key: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _raise_for_status(response: httpx.Response, *, model: str) -> None:
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
