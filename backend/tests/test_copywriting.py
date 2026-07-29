import pytest

from app.copywriting.service import (
    CopywritingService,
    RewriteRequest,
    StructuredOutputError,
)


class FixtureChat:
    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.prompts: list[str] = []

    def complete(self, *, api_key: str, model: str, prompt: str) -> str:
        assert api_key == "secret"
        assert model == "qwen-plus"
        self.prompts.append(prompt)
        return self.responses.pop(0)


def request() -> RewriteRequest:
    return RewriteRequest(
        source_text="我们有十年工厂经验，提供广告袋定制。",
        persona_name="袋研官",
        brand_facts=["十年经验", "自有工厂"],
        tone="专业直接",
        cta="关注我",
        banned_words=["全网最低"],
        shots=[
            {"index": 0, "role": "hook", "assetCategoryId": "people"},
            {"index": 1, "role": "cta", "assetCategoryId": "door"},
        ],
    )


def test_rewrite_returns_validated_shots_in_template_order() -> None:
    chat = FixtureChat(
        [
            """{"shots":[
              {"index":0,"role":"hook","assetCategoryId":"people",
               "copywriting":"十年工厂经验，帮你少走定制弯路。",
               "durationMode":"voice","muteOriginal":true},
              {"index":1,"role":"cta","assetCategoryId":"door",
               "copywriting":"关注我，了解广告物料怎么选。",
               "durationMode":"voice","muteOriginal":true}
            ]}"""
        ]
    )

    result = CopywritingService(chat).rewrite(
        api_key="secret", model="qwen-plus", request=request()
    )

    assert [shot.index for shot in result.shots] == [0, 1]
    assert result.shots[0].copywriting == "十年工厂经验，帮你少走定制弯路。"


def test_rewrite_repairs_invalid_json_at_most_twice() -> None:
    chat = FixtureChat(["not json", "still broken", "also broken"])

    with pytest.raises(StructuredOutputError):
        CopywritingService(chat).rewrite(
            api_key="secret", model="qwen-plus", request=request()
        )

    assert len(chat.prompts) == 3
    assert "上一次输出无法通过校验" in chat.prompts[1]
