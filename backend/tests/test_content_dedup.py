from datetime import UTC, datetime

import pytest

from app.copywriting.content_identity import (
    ContentHistoryItem,
    ContentIdentity,
    DedupCandidate,
)
from app.copywriting.dedup import (
    ContentDeduplicator,
    cosine_similarity,
    lexical_similarity,
    normalize_content,
)


NOW = datetime(2026, 9, 16, tzinfo=UTC)


def identity(**overrides: str | None) -> ContentIdentity:
    values: dict[str, str | None] = {
        "audience": "品牌采购",
        "scenario": "活动礼赠",
        "problem": "预算有限时如何取舍",
        "thesis": "低价会让袋子的耐用性下降",
        "evidenceType": "工艺对比",
        "angle": "预算分配",
        "structureType": "正反对比",
        "hookType": "反常识",
        "viewerGain": "知道有限预算应优先保留什么",
        "hotspotId": None,
    }
    values.update(overrides)
    return ContentIdentity.model_validate(values)


def candidate(**overrides) -> DedupCandidate:
    values = {
        "id": "candidate-a",
        "displayTitle": "预算有限时袋子哪里不能省",
        "shortTitle": "预算先保哪里",
        "description": "从活动礼赠场景说明有限预算应优先保留承重结构",
        "hook": "预算有限，最先砍掉的真不该是这里。",
        "identity": identity(),
        "semanticVector": None,
    }
    values.update(overrides)
    return DedupCandidate.model_validate(values)


def history(*, last_used_at: str = "2026-09-15T00:00:00Z", **overrides) -> ContentHistoryItem:
    source = candidate(**overrides)
    return ContentHistoryItem.model_validate({
        "id": "history-a",
        "contentType": "topic",
        "lifecycleState": "shown",
        "displayTitle": source.display_title,
        "shortTitle": source.short_title,
        "description": source.description,
        "hook": source.hook,
        "contentText": "",
        "identity": source.identity.model_dump(by_alias=True),
        "semanticVector": source.semantic_vector,
        "lastUsedAt": last_used_at,
    })


def test_normalize_content_unifies_punctuation_width_and_simple_numerals() -> None:
    assert normalize_content("９块９，袋子！") == normalize_content("九块九袋子")


def test_lexical_similarity_rewards_matching_chinese_phrases() -> None:
    assert lexical_similarity("预算有限时袋子哪里不能省", "预算有限袋子不能省哪里") > 0.72
    assert lexical_similarity("预算有限时袋子哪里不能省", "展会赠品如何选颜色") < 0.45


def test_cosine_similarity_rejects_malformed_vectors() -> None:
    assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)
    assert cosine_similarity([1.0], [1.0, 0.0]) == 0.0
    assert cosine_similarity([], []) == 0.0


def test_exact_topic_is_permanently_rejected() -> None:
    decision = ContentDeduplicator(now=NOW).evaluate(
        candidate(),
        [history(last_used_at="2025-01-01T00:00:00Z")],
    )
    assert decision.duplicate is True
    assert decision.reason_code == "EXACT_DUPLICATE"


def test_recent_same_thesis_is_rejected_even_with_new_title() -> None:
    previous = history()
    fresh = candidate(
        displayTitle="促销袋压价为什么容易返工",
        shortTitle="返工成本真相",
        description="从返工现场说明一味压价如何损害袋子的实际耐用程度",
        hook="报价省下来的钱，为什么最后都花在返工上？",
        identity=identity(
            problem="低价订单为什么容易返工",
            thesis="袋子价格太低会导致耐用下降",
            angle="返工成本",
            structureType="成本账",
            hookType="追问",
        ),
    )

    decision = ContentDeduplicator(now=NOW).evaluate(fresh, [previous])

    assert decision.duplicate is True
    assert decision.reason_code == "RECENT_THESIS_DUPLICATE"


def test_cooled_thesis_still_requires_three_changed_dimensions() -> None:
    previous = history(last_used_at="2026-01-01T00:00:00Z")
    fresh = candidate(
        displayTitle="门店赠袋如何兼顾预算耐用",
        shortTitle="门店赠袋取舍",
        description="讨论门店经营者选择赠袋时如何平衡现场发放体验",
        hook="客人把赠袋带走之前，门店真正要确认的是什么？",
        identity=identity(
            audience="门店经营者",
            scenario="门店赠礼",
            evidenceType="工艺对比",
        ),
    )

    decision = ContentDeduplicator(now=NOW).evaluate(fresh, [previous])

    assert decision.duplicate is True
    assert decision.reason_code == "COOLED_THESIS_INSUFFICIENT_CHANGE"


def test_cooled_thesis_is_allowed_after_three_material_changes() -> None:
    previous = history(last_used_at="2026-01-01T00:00:00Z")
    fresh = candidate(
        displayTitle="门店赠袋怎么测试才不返工",
        shortTitle="赠袋测试现场",
        description="给门店经营者展示赠袋承重测试的完整操作和验收顺序",
        hook="不用听报价解释，先把这三样东西装进去。",
        identity=identity(
            audience="门店经营者",
            scenario="门店赠礼",
            evidenceType="现场测试",
            structureType="现场演示",
            hookType="动作开场",
            viewerGain="学会现场测试赠袋",
        ),
    )

    decision = ContentDeduplicator(now=NOW).evaluate(fresh, [previous])

    assert decision.duplicate is False


def test_high_vector_similarity_is_rejected_when_text_looks_different() -> None:
    previous = history(semanticVector=[1.0, 0.0, 0.0])
    fresh = candidate(
        displayTitle="礼赠预算应该优先投向哪里",
        shortTitle="礼赠预算顺序",
        description="讨论品牌礼赠预算应该如何安排才能减少实际使用损耗",
        hook="预算表里看不出来的损耗，用户用一次就知道。",
        identity=identity(thesis="先保证产品可用再讨论表面装饰"),
        semanticVector=[0.99, 0.01, 0.0],
    )

    decision = ContentDeduplicator(now=NOW).evaluate(fresh, [previous])

    assert decision.duplicate is True
    assert decision.reason_code == "SEMANTIC_DUPLICATE"


def test_distinct_topic_passes_without_gray_zone_review() -> None:
    fresh = candidate(
        displayTitle="展会帆布袋颜色怎样适配灯光",
        shortTitle="展会颜色选择",
        description="解释不同展会灯光下帆布袋印刷颜色偏差的检查方法",
        hook="展厅里看着高级的颜色，到了现场可能完全变样。",
        identity=identity(
            audience="展会设计师",
            scenario="展厅布置",
            problem="现场灯光导致颜色偏差",
            thesis="选色必须结合展厅灯光进行打样",
            evidenceType="色样对比",
            angle="光线影响",
            structureType="测试演示",
            hookType="场景冲突",
            viewerGain="学会在展厅灯光下验色",
        ),
    )

    decision = ContentDeduplicator(now=NOW).evaluate(fresh, [history()])

    assert decision.duplicate is False
    assert decision.needs_judgment is False
