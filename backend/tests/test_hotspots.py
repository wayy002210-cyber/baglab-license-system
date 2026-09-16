from datetime import UTC, datetime

from app.copywriting.bailian import BailianAPIError, SearchResponse, SearchSource
from app.copywriting.hotspots import HotspotProvider


NOW = datetime(2026, 9, 16, 8, 0, tzinfo=UTC)


class SearchFixture:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0

    def search(self, *, api_key: str, model: str, prompt: str) -> SearchResponse:
        self.calls += 1
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def sourced_response() -> SearchResponse:
    return SearchResponse(
        content="""{"hotspots":[
          {"id":"hot-1","title":"商场更新环保包装要求","sourceUrl":"https://news.example.com/green",
           "publishedAt":"2026-09-15","summary":"新要求涉及零售礼赠袋材料说明。",
           "relevance":"可从帆布袋材料选择和标识方式切入"},
          {"id":"hot-2","title":"没有真实来源的候选","sourceUrl":"https://fake.example.com/item",
           "publishedAt":"2026-09-15","summary":"该内容没有出现在搜索来源中。",
           "relevance":"与帆布袋相关"}
        ]}""",
        sources=[SearchSource(
            title="商场更新环保包装要求",
            url="https://news.example.com/green",
            site_name="行业媒体",
        )],
    )


def test_provider_keeps_only_candidates_backed_by_search_sources() -> None:
    provider = HotspotProvider(SearchFixture([sourced_response()]), ttl_seconds=3600)

    result = provider.get(
        api_key="secret", model="qwen-plus", industry="帆布袋", now=NOW,
        mode="balanced",
    )

    assert len(result) == 1
    assert result[0].id == "hot-1"
    assert result[0].source_url == "https://news.example.com/green"
    assert result[0].retrieved_at == NOW


def test_provider_reuses_cached_results_within_ttl() -> None:
    chat = SearchFixture([sourced_response()])
    provider = HotspotProvider(chat, ttl_seconds=3600)

    first = provider.get(
        api_key="secret", model="qwen-plus", industry="帆布袋", now=NOW,
        mode="balanced",
    )
    second = provider.get(
        api_key="secret", model="qwen-plus", industry="帆布袋", now=NOW,
        mode="balanced",
    )

    assert second == first
    assert chat.calls == 1


def test_provider_returns_empty_for_disabled_mode_without_searching() -> None:
    chat = SearchFixture([])
    provider = HotspotProvider(chat)

    assert provider.get(
        api_key="secret", model="qwen-plus", industry="帆布袋", now=NOW,
        mode="off",
    ) == []
    assert chat.calls == 0


def test_provider_degrades_to_empty_on_recoverable_search_failure() -> None:
    chat = SearchFixture([BailianAPIError(
        "network unavailable", code="BAILIAN_SEARCH_UNAVAILABLE", status_code=503
    )])
    provider = HotspotProvider(chat)

    assert provider.get(
        api_key="secret", model="qwen-plus", industry="帆布袋", now=NOW,
        mode="priority",
    ) == []


def test_provider_rejects_future_dates_and_non_https_urls() -> None:
    response = SearchResponse(
        content="""{"hotspots":[
          {"id":"future","title":"未来消息","sourceUrl":"https://news.example.com/future",
           "publishedAt":"2026-10-01","summary":"来自未来。","relevance":"与帆布袋有关"},
          {"id":"unsafe","title":"不安全链接","sourceUrl":"http://news.example.com/item",
           "publishedAt":"2026-09-15","summary":"不是加密来源。","relevance":"与帆布袋有关"}
        ]}""",
        sources=[
            SearchSource(title="未来消息", url="https://news.example.com/future", site_name="来源"),
            SearchSource(title="不安全链接", url="http://news.example.com/item", site_name="来源"),
        ],
    )
    provider = HotspotProvider(SearchFixture([response]))

    result = provider.get(
        api_key="secret", model="qwen-plus", industry="帆布袋", now=NOW,
        mode="balanced",
    )

    assert result == []
