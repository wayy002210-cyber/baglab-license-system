from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ComplianceRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    text: str = Field(min_length=1, max_length=20_000)
    persona_banned_words: list[str] = Field(
        default_factory=list, alias="personaBannedWords"
    )


class ComplianceIssue(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    term: str
    start: int
    end: int
    risk_type: str = Field(alias="riskType")
    explanation: str
    suggestion: str


class ComplianceResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    original_text: str = Field(alias="originalText")
    issues: list[ComplianceIssue]
    disclaimer: str


LOCAL_RULES = {
    "第一": ("ranking", "可能构成缺少依据的排名或绝对化表达", "较为领先"),
    "最": ("superlative", "可能构成绝对化或最高级表达", "更"),
    "国家级": ("authority", "需要相应资质和证据支持", "具有相关经验的"),
    "顶级": ("superlative", "可能构成无法验证的最高级表达", "高标准"),
    "绝对": ("absolute", "可能构成无法保证的绝对承诺", "尽可能"),
    "100%": ("absolute", "可能构成无法保证的绝对承诺", "力求"),
}


class ComplianceChecker:
    def check(self, request: ComplianceRequest) -> ComplianceResult:
        issues: list[ComplianceIssue] = []
        seen: set[tuple[int, int, str]] = set()

        def add_matches(
            term: str, risk_type: str, explanation: str, suggestion: str
        ) -> None:
            start = 0
            while True:
                index = request.text.find(term, start)
                if index < 0:
                    break
                key = (index, index + len(term), risk_type)
                if key not in seen:
                    issues.append(
                        ComplianceIssue(
                            term=term,
                            start=index,
                            end=index + len(term),
                            riskType=risk_type,
                            explanation=explanation,
                            suggestion=suggestion,
                        )
                    )
                    seen.add(key)
                start = index + len(term)

        for term, (risk_type, explanation, suggestion) in LOCAL_RULES.items():
            add_matches(term, risk_type, explanation, suggestion)
        for term in request.persona_banned_words:
            if term:
                add_matches(
                    term,
                    "persona",
                    "该表达出现在当前人设档案的禁用词中",
                    "删除或改为符合品牌口径的表达",
                )

        issues.sort(key=lambda issue: (issue.start, -(issue.end - issue.start)))
        return ComplianceResult(
            originalText=request.text,
            issues=issues,
            disclaimer="风险提示仅用于内容检查，不构成法律结论。",
        )
