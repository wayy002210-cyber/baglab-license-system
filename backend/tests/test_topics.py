import pytest

from app.copywriting.topic_service import (
    CopywritingGenerationRequest,
    NovelTopicsExhausted,
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


def candidate_json(
    key: str,
    display_title: str,
    short_title: str,
    *,
    audience: str,
    scenario: str,
    problem: str,
    thesis: str,
    evidence: str,
    angle: str,
    structure: str,
    hook_type: str,
) -> dict:
    return {
        "id": key,
        "displayTitle": display_title,
        "shortTitle": short_title,
        "description": f"面向{audience}，在{scenario}中讲清{problem}并给出可执行方法",
        "hook": f"{scenario}里，{problem}真正应该先看什么？",
        "identity": {
            "audience": audience,
            "scenario": scenario,
            "problem": problem,
            "thesis": thesis,
            "evidenceType": evidence,
            "angle": angle,
            "structureType": structure,
            "hookType": hook_type,
            "viewerGain": f"学会判断{problem}",
            "hotspotId": None,
        },
        "hotspot": None,
    }


def topic_response(items: list[dict]) -> str:
    import json

    return json.dumps({"topics": items}, ensure_ascii=False)


def five_diverse_candidates() -> list[dict]:
    rows = [
        ("material", "不同克重面料应该怎样选择", "面料克重选择", "产品经理", "新品打样", "面料克重选择", "克重需要匹配使用场景", "样布测试", "材料选择", "测试演示", "现场动作"),
        ("color", "展厅灯光为何改变袋子颜色", "展厅颜色偏差", "展会设计师", "展厅布置", "现场颜色偏差", "选色必须在现场灯光下确认", "色样对比", "光线影响", "现场观察", "场景冲突"),
        ("stitch", "承重测试如何提前发现返工", "承重测试方法", "质量人员", "批量验收", "提前发现缝线风险", "批量生产前需要完成承重测试", "承重实验", "验收流程", "流程揭示", "问题追问"),
        ("delivery", "交期倒推怎样避免活动延期", "交期倒推方法", "活动策划", "大型活动", "交期规划失误", "从活动日期反推确认节点", "时间节点", "项目管理", "决策复盘", "时间冲突"),
        ("reuse", "礼赠袋怎样设计才会被反复用", "重复使用设计", "品牌经理", "会员礼赠", "礼赠袋使用率低", "设计需要进入用户日常场景", "场景分析", "用户行为", "层层问答", "结果反问"),
    ]
    return [
        candidate_json(
            key, title, short, audience=audience, scenario=scenario,
            problem=problem, thesis=thesis, evidence=evidence, angle=angle,
            structure=structure, hook_type=hook_type,
        )
        for key, title, short, audience, scenario, problem, thesis, evidence, angle, structure, hook_type in rows
    ]


def test_topics_returns_five_unique_candidates() -> None:
    chat = FixtureChat([topic_response(five_diverse_candidates())])
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


def test_topics_accepts_provider_extras_without_retrying() -> None:
    items = five_diverse_candidates()
    items[0]["shortTitle"] = f" {items[0]['shortTitle']} "
    items.append(candidate_json(
        "sixth", "电商发货袋尺寸如何减少空隙", "发货尺寸选择",
        audience="电商卖家", scenario="仓库发货", problem="包装空隙过大",
        thesis="尺寸应匹配常见订单组合", evidence="订单测量", angle="仓储效率",
        structure="成本计算", hook_type="数字疑问",
    ))
    chat = FixtureChat([topic_response(items)])
    service = TopicService(chat)

    result = service.generate_topics(
        api_key="secret",
        request=TopicGenerationRequest(
            model="deepseek-v3",
            personaName="袋研官",
        ),
    )

    assert len(result.topics) == 5
    assert all(topic.short_title == topic.short_title.strip() for topic in result.topics)
    assert {topic.id for topic in result.topics}.issubset({item["id"] for item in items})
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

    assert len(result.text.replace("\n", "").replace("，", "").replace("。", "")) == 220
    assert all(len(line.rstrip("，。！？；：")) <= 25 for line in result.text.splitlines())


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
    punctuation = str.maketrans("", "", "，。！？；：")
    assert result.text.replace("\n", "").translate(punctuation) == repaired.translate(punctuation)
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

    punctuation = str.maketrans("", "", "，。！？；：")
    assert result.text.replace("\n", "").translate(punctuation) == draft.translate(punctuation)
    assert len(chat.calls) == 3


def test_topic_planner_filters_history_and_refills_only_missing_slots() -> None:
    duplicate = candidate_json(
        "dup", "预算有限时袋子哪里不能省", "预算先保哪里",
        audience="品牌采购", scenario="活动礼赠", problem="预算有限如何取舍",
        thesis="预算有限时先保承重结构", evidence="工艺对比", angle="预算分配",
        structure="正反对比", hook_type="反常识",
    )
    material = candidate_json(
        "material", "不同克重面料应该怎样选择", "面料克重选择",
        audience="产品经理", scenario="新品打样", problem="面料克重选择",
        thesis="克重需要匹配使用场景", evidence="样布测试", angle="材料选择",
        structure="测试演示", hook_type="现场动作",
    )
    color = candidate_json(
        "color", "展厅灯光为何改变袋子颜色", "展厅颜色偏差",
        audience="展会设计师", scenario="展厅布置", problem="现场颜色偏差",
        thesis="选色必须在现场灯光下确认", evidence="色样对比", angle="光线影响",
        structure="现场观察", hook_type="场景冲突",
    )
    stitching = candidate_json(
        "stitch", "承重测试如何提前发现返工", "承重测试方法",
        audience="质量人员", scenario="批量验收", problem="提前发现缝线风险",
        thesis="批量生产前需要完成承重测试", evidence="承重实验", angle="验收流程",
        structure="流程揭示", hook_type="问题追问",
    )
    delivery = candidate_json(
        "delivery", "交期倒推怎样避免活动延期", "交期倒推方法",
        audience="活动策划", scenario="大型活动", problem="交期规划失误",
        thesis="从活动日期反推确认节点", evidence="时间节点", angle="项目管理",
        structure="决策复盘", hook_type="时间冲突",
    )
    reuse = candidate_json(
        "reuse", "礼赠袋怎样设计才会被反复用", "重复使用设计",
        audience="品牌经理", scenario="会员礼赠", problem="礼赠袋使用率低",
        thesis="设计需要进入用户日常场景", evidence="场景分析", angle="用户行为",
        structure="层层问答", hook_type="结果反问",
    )
    chat = FixtureChat([
        topic_response([duplicate, material, color, material, duplicate]),
        topic_response([stitching, delivery, reuse]),
    ])
    request = TopicGenerationRequest.model_validate({
        "model": "deepseek-v3",
        "personaId": "p1",
        "personaName": "袋研官",
        "industry": "帆布袋",
        "brandFacts": ["自有工厂"],
        "hotspotMode": "off",
        "history": [{
            "id": "history-1", "contentType": "topic", "lifecycleState": "shown",
            "displayTitle": duplicate["displayTitle"], "shortTitle": duplicate["shortTitle"],
            "description": duplicate["description"], "hook": duplicate["hook"],
            "contentText": "", "identity": duplicate["identity"],
            "semanticVector": None, "lastUsedAt": "2026-09-15T00:00:00Z",
        }],
    })

    result = TopicService(chat).generate_topics(api_key="secret", request=request)

    assert len(result.topics) == 5
    assert {item.id for item in result.topics} == {"material", "color", "stitch", "delivery", "reuse"}
    assert len(chat.calls) == 2
    assert "只补充还缺少的3个" in chat.calls[1][1]
    assert result.history_checked == 1


def test_topic_planner_stops_instead_of_filling_with_duplicates() -> None:
    repeated = candidate_json(
        "same", "预算有限时袋子哪里不能省", "预算先保哪里",
        audience="品牌采购", scenario="活动礼赠", problem="预算有限如何取舍",
        thesis="预算有限时先保承重结构", evidence="工艺对比", angle="预算分配",
        structure="正反对比", hook_type="反常识",
    )
    chat = FixtureChat([topic_response([repeated])] * 3)

    with pytest.raises(NovelTopicsExhausted) as captured:
        TopicService(chat).generate_topics(
            api_key="secret",
            request=TopicGenerationRequest(
                model="deepseek-v3", personaId="p1", personaName="袋研官",
                industry="帆布袋", hotspotMode="off",
            ),
        )

    assert captured.value.accepted_count == 1
    assert len(chat.calls) == 3


def test_topic_prompt_requests_candidate_pool_without_low_price_seed_example() -> None:
    items = five_diverse_candidates()
    chat = FixtureChat([topic_response(items)])

    TopicService(chat).generate_topics(
        api_key="secret",
        request=TopicGenerationRequest(
            model="deepseek-v3", personaId="p1", personaName="袋研官",
            industry="帆布袋", hotspotMode="off",
        ),
    )

    prompt = chat.calls[0][1]
    assert "12到15个" in prompt
    assert "同行低价真相" not in prompt
