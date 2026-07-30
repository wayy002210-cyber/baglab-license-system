from app.copywriting.topic_service import (
    CopywritingGenerationRequest,
    TopicGenerationRequest,
    TopicService,
)


class FixtureChat:
    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, str]] = []

    def complete(self, *, api_key: str, model: str, prompt: str) -> str:
        assert api_key == "secret"
        self.calls.append((model, prompt))
        return self.responses.pop(0)


def test_topics_returns_five_unique_candidates() -> None:
    chat = FixtureChat(
        [
            """{"topics":[
              {"id":"a","title":"工厂宣传片为什么没人看","angle":"客户损失","hook":"别再只拍设备"},
              {"id":"b","title":"一条视频讲清工厂实力","angle":"信任","hook":"客户先看这三点"},
              {"id":"c","title":"宣传成本浪费在哪里","angle":"成本","hook":"贵的不一定有效"},
              {"id":"d","title":"素材如何重复产生价值","angle":"复用","hook":"一次拍摄多次使用"},
              {"id":"e","title":"门店口播如何留住客户","angle":"转化","hook":"开场三秒别说欢迎"}
            ]}"""
        ]
    )
    service = TopicService(chat)

    result = service.generate_topics(
        api_key="secret",
        request=TopicGenerationRequest(
            model="deepseek-v3",
            personaName="袋研官",
            industry="工厂",
            brandFacts=["自有工厂"],
            tone="专业直接",
            cta="欢迎咨询",
            referenceScripts=[],
        ),
    )

    assert len(result.topics) == 5
    assert len({topic.title for topic in result.topics}) == 5
    assert chat.calls[0][0] == "deepseek-v3"


def test_topics_normalizes_provider_extras_without_retrying() -> None:
    chat = FixtureChat(
        [
            """{"topics":[
              {"id":"a","title":" 选题一 ","angle":"角度一","hook":"钩子一"},
              {"id":"b","title":"选题二","angle":"角度二","hook":"钩子二"},
              {"id":"c","title":"选题三","angle":"角度三","hook":"钩子三"},
              {"id":"d","title":"选题四","angle":"角度四","hook":"钩子四"},
              {"id":"e","title":"选题五","angle":"角度五","hook":"钩子五"},
              {"id":"f","title":"多余选题","angle":"多余角度","hook":"多余钩子"}
            ]}"""
        ]
    )
    service = TopicService(chat)

    result = service.generate_topics(
        api_key="secret",
        request=TopicGenerationRequest(
            model="deepseek-v3",
            personaName="袋研官",
        ),
    )

    assert [topic.title for topic in result.topics] == [
        "选题一",
        "选题二",
        "选题三",
        "选题四",
        "选题五",
    ]
    assert len(chat.calls) == 1


def test_generate_copywriting_enforces_requested_length() -> None:
    text = "工" * 220
    service = TopicService(FixtureChat([f'{{"text":"{text}"}}']))

    result = service.generate_copywriting(
        api_key="secret",
        request=CopywritingGenerationRequest(
            model="qwen-plus",
            personaName="袋研官",
            industry="工厂",
            brandFacts=["自有工厂"],
            tone="专业",
            cta="欢迎咨询",
            bannedWords=[],
            topic="工厂获客",
            minLength=200,
            maxLength=1000,
            referenceScripts=[],
        ),
    )

    assert len(result.text) == 220


def test_generate_copywriting_repairs_banned_words_before_returning() -> None:
    invalid = "这是第一选择。" + ("好" * 210)
    repaired = "这是合适的选择。" + ("好" * 210)
    chat = FixtureChat(
        [
            f'{{"text":"{invalid}"}}',
            f'{{"text":"{repaired}"}}',
        ]
    )
    service = TopicService(chat)

    result = service.generate_copywriting(
        api_key="secret",
        request=CopywritingGenerationRequest(
            model="deepseek-v3",
            personaName="袋研官",
            bannedWords=["第一"],
            topic="品牌物料",
            minLength=200,
            maxLength=1000,
        ),
    )

    assert "第一" not in result.text
    assert result.text == repaired
    assert len(chat.calls) == 2


def test_generate_copywriting_does_not_discard_draft_when_banned_word_repairs_fail() -> None:
    draft = "这个方案最适合当前场景。" + ("好" * 210)
    chat = FixtureChat([f'{{"text":"{draft}"}}'] * 3)
    service = TopicService(chat)

    result = service.generate_copywriting(
        api_key="secret",
        request=CopywritingGenerationRequest(
            model="deepseek-v3",
            personaName="袋研官",
            bannedWords=["最"],
            topic="品牌物料",
            minLength=200,
            maxLength=1000,
        ),
    )

    assert result.text == draft
    assert len(chat.calls) == 3
