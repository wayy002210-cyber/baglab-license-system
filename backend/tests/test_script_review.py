from datetime import UTC, datetime

from app.copywriting.content_identity import ContentHistoryItem, ContentIdentity
from app.copywriting.script_review import ScriptDraft, ScriptReviewer


NOW = datetime(2026, 9, 16, tzinfo=UTC)


def identity(structure: str = "正反对比") -> ContentIdentity:
    return ContentIdentity(
        audience="品牌采购",
        scenario="活动礼赠",
        problem="预算有限如何取舍",
        thesis="预算有限时先保证承重结构",
        evidenceType="工艺对比",
        angle="预算分配",
        structureType=structure,
        hookType="反常识",
        viewerGain="学会安排定制预算",
    )


def script_history(text: str, structure: str = "正反对比") -> ContentHistoryItem:
    return ContentHistoryItem(
        id="old-script",
        contentType="script",
        lifecycleState="generated",
        displayTitle="预算有限时袋子哪里不能省",
        shortTitle="预算先保哪里",
        description="",
        hook="预算不多时，先别急着压低所有配置。",
        contentText=text,
        identity=identity(structure),
        lastUsedAt=NOW,
    )


def test_repeated_opening_and_argument_order_are_rejected() -> None:
    previous = "\n".join([
        "预算不多时，先别急着压低所有配置。",
        "很多人会先把面料和车线一起降级。",
        "结果活动还没结束，袋子就开始开线。",
        "先确认装什么，再确定承重要求。",
        "然后用承重测试检查车线和提手。",
        "最后再调整不影响使用的装饰细节。",
        "关注我，少走定制弯路。",
    ])
    candidate = ScriptDraft(
        text=previous.replace("很多人", "不少采购"),
        structureType="正反对比",
        hookType="反常识",
        argumentBeats=["先确认装什么", "检查车线和提手", "调整装饰细节"],
    )

    review = ScriptReviewer().review(candidate, [script_history(previous)])

    assert review.accepted is False
    assert "OPENING_DUPLICATE" in review.reason_codes
    assert "ARGUMENT_ORDER_DUPLICATE" in review.reason_codes
    assert "改用不同结构" in review.rewrite_instruction


def test_distinct_structure_and_evidence_are_accepted() -> None:
    previous = "\n".join([
        "预算不多时，先别急着压低所有配置。",
        "先确认装什么，再确定承重要求。",
        "然后用承重测试检查车线和提手。",
        "最后再调整装饰细节。",
    ])
    candidate = ScriptDraft(
        text="\n".join([
            "把样袋装满六瓶水，先提起来走一圈。",
            "如果提手根部开始变形，就记录受力位置。",
            "接着换一组车线，再做相同测试。",
            "两次结果摆在一起，采购就能看懂差别。",
            "这个方法比只问克重更接近真实使用。",
        ]),
        structureType="现场演示",
        hookType="现场动作",
        argumentBeats=["装水测试", "记录受力位置", "对比两组车线"],
    )

    review = ScriptReviewer().review(candidate, [script_history(previous)])

    assert review.accepted is True
    assert review.reason_codes == []
    assert review.signature.structure_type == "现场演示"
