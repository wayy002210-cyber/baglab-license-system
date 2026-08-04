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
              {"id":"a","shortTitle":"工厂宣传真相","description":"从客户损失解释只拍设备为什么无效","hook":"别再只拍设备"},
              {"id":"b","shortTitle":"工厂实力三点","description":"用三个可验证角度建立客户信任","hook":"客户先看这三点"},
              {"id":"c","shortTitle":"宣传浪费在哪","description":"解释宣传成本被无效内容浪费的原因","hook":"贵的不一定有效"},
              {"id":"d","shortTitle":"素材重复生钱","description":"说明一次拍摄如何拆成多条内容复用","hook":"一次拍摄多次使用"},
              {"id":"e","shortTitle":"门店口播留客","description":"讲清开场三秒如何提升门店转化","hook":"开场三秒别说欢迎"}
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
    assert len({topic.short_title for topic in result.topics}) == 5
    assert chat.calls[0][0] == "deepseek-v3"


def test_topics_normalizes_provider_extras_without_retrying() -> None:
    chat = FixtureChat(
        [
            """{"topics":[
              {"id":"a","shortTitle":" 工厂选题一号 ","description":"第一个内容方向的详细解释","hook":"钩子一"},
              {"id":"b","shortTitle":"工厂选题二号","description":"第二个内容方向的详细解释","hook":"钩子二"},
              {"id":"c","shortTitle":"工厂选题三号","description":"第三个内容方向的详细解释","hook":"钩子三"},
              {"id":"d","shortTitle":"工厂选题四号","description":"第四个内容方向的详细解释","hook":"钩子四"},
              {"id":"e","shortTitle":"工厂选题五号","description":"第五个内容方向的详细解释","hook":"钩子五"},
              {"id":"f","shortTitle":"工厂多余选题","description":"这是多余内容方向的详细解释","hook":"钩子六"}
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

    assert [topic.short_title for topic in result.topics] == [
        "工厂选题一号",
        "工厂选题二号",
        "工厂选题三号",
        "工厂选题四号",
        "工厂选题五号",
    ]
    assert len(chat.calls) == 1


def test_generate_copywriting_removes_stage_directions() -> None:
    text = "（叉腰叹气）同行价格越来越低。【停顿】但质量不能降。" + ("好" * 210)
    service = TopicService(FixtureChat([f'{{"text":"{text}"}}']))
    result = service.generate_copywriting(
        api_key="secret",
        request=CopywritingGenerationRequest(
            model="deepseek-v3", personaName="袋研官", topic="同行低价真相",
            minLength=200, maxLength=1000,
        ),
    )
    assert "叉腰" not in result.text
    assert "停顿" not in result.text


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
