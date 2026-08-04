import pytest

from app.copywriting.spoken_copy import clean_spoken_copy

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


def test_spoken_copy_is_formatted_as_short_newline_separated_lines() -> None:
    source = (
        "你知道一个袋子为什么能带来多少品牌曝光吗？"
        "别小看这个小小的帆布袋，它可是品牌传播的流动广告位。"
        "每一个细节都关系到客户愿不愿意长期使用。"
    )

    result = clean_spoken_copy(source)
    lines = result.splitlines()

    assert len(lines) >= 3
    assert all(line.strip() for line in lines)
    assert all(10 <= len(line.rstrip("，。！？；：")) <= 25 for line in lines)
    assert all(line.endswith(tuple("，。！？；：")) for line in lines)


def test_spoken_copy_merges_tiny_sentences_and_adds_punctuation() -> None:
    result = clean_spoken_copy("品质很重要\n我们坚持做好每一道工序\n客户才能长期信任我们")

    assert result.splitlines() == [
        "品质很重要，我们坚持做好每一道工序。",
        "客户才能长期信任我们。",
    ]
