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
