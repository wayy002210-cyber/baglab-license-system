from app.copywriting.compliance import ComplianceChecker, ComplianceRequest


def test_local_compliance_marks_superlatives_without_rewriting() -> None:
    checker = ComplianceChecker()
    result = checker.check(
        ComplianceRequest(
            text="这是全网最好的产品，也是行业第一。",
            personaBannedWords=[],
        )
    )

    assert result.original_text == "这是全网最好的产品，也是行业第一。"
    assert {issue.term for issue in result.issues} >= {"最", "第一"}
    assert all(issue.suggestion for issue in result.issues)


def test_persona_banned_words_are_included_and_offsets_are_preserved() -> None:
    checker = ComplianceChecker()
    result = checker.check(
        ComplianceRequest(text="不要承诺绝对有效", personaBannedWords=["绝对有效"])
    )

    issue = next(item for item in result.issues if item.term == "绝对有效")
    assert result.original_text[issue.start : issue.end] == issue.term
    assert issue.risk_type == "persona"
