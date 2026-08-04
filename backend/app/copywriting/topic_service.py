from __future__ import annotations

import json
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.copywriting.compliance import ComplianceChecker, ComplianceRequest, ComplianceResult
from app.copywriting.service import StructuredOutputError, _extract_json
from app.copywriting.spoken_copy import clean_spoken_copy


class ChatCompletion(Protocol):
    def complete(self, *, api_key: str, model: str, prompt: str) -> str: ...


class TopicCandidate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(min_length=1)
    short_title: str = Field(
        alias="shortTitle", min_length=5, max_length=8,
        pattern=r"^[\u3400-\u9fff]+$",
    )
    description: str = Field(min_length=10, max_length=160)
    hook: str = Field(min_length=1, max_length=120)


class TopicResult(BaseModel):
    topics: list[TopicCandidate] = Field(min_length=5, max_length=5)

    @model_validator(mode="before")
    @classmethod
    def normalize_provider_topics(cls, value):
        if not isinstance(value, dict) or not isinstance(value.get("topics"), list):
            return value
        normalized = []
        seen_titles: set[str] = set()
        for index, item in enumerate(value["topics"]):
            if not isinstance(item, dict):
                continue
            short_title = str(item.get("shortTitle", "")).strip()
            description = str(item.get("description", "")).strip()
            hook = str(item.get("hook", "")).strip()
            if not short_title or not description or not hook or short_title in seen_titles:
                continue
            seen_titles.add(short_title)
            normalized.append({
                "id": str(item.get("id") or index + 1),
                "shortTitle": short_title[:8],
                "description": description[:160],
                "hook": hook[:120],
            })
            if len(normalized) == 5:
                break
        return {**value, "topics": normalized}

    @model_validator(mode="after")
    def require_unique_topics(self) -> "TopicResult":
        titles = [topic.short_title.strip() for topic in self.topics]
        if len(set(titles)) != 5:
            raise ValueError("topic titles must be unique")
        return self


class TopicGenerationRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    model: str = Field(min_length=1)
    persona_name: str = Field(alias="personaName", min_length=1)
    industry: str = ""
    brand_facts: list[str] = Field(default_factory=list, alias="brandFacts")
    tone: str = ""
    cta: str = ""
    reference_scripts: list[str] = Field(
        default_factory=list, alias="referenceScripts", max_length=5
    )


class CopywritingGenerationRequest(TopicGenerationRequest):
    banned_words: list[str] = Field(default_factory=list, alias="bannedWords")
    topic: str = Field(min_length=1)
    min_length: int = Field(default=200, alias="minLength", ge=50, le=1000)
    max_length: int = Field(default=1000, alias="maxLength", ge=200, le=2000)

    @model_validator(mode="after")
    def validate_length_range(self) -> "CopywritingGenerationRequest":
        if self.min_length > self.max_length:
            raise ValueError("minLength cannot exceed maxLength")
        return self


class CopywritingResult(BaseModel):
    text: str = Field(min_length=1)


class RecoverableCopywritingWarning(ValueError):
    """A draft-quality warning that should trigger repair without losing it."""


def _persona_context(request: TopicGenerationRequest) -> str:
    return json.dumps({
        "人设": request.persona_name,
        "行业": request.industry,
        "已确认事实": request.brand_facts,
        "语气": request.tone,
        "行动引导": request.cta,
        "参考脚本结构": request.reference_scripts,
    }, ensure_ascii=False)


class TopicService:
    def __init__(self, chat: ChatCompletion) -> None:
        self.chat = chat

    def _structured(
        self, *, api_key: str, model: str, prompt: str, schema, post_validate=None
    ):
        current_prompt = prompt
        last_error = ""
        result = None
        for attempt in range(3):
            response = self.chat.complete(
                api_key=api_key, model=model, prompt=current_prompt
            )
            try:
                result = schema.model_validate(_extract_json(response))
                if post_validate is not None:
                    post_validate(result)
                return result
            except (json.JSONDecodeError, ValidationError, ValueError) as error:
                last_error = str(error)
                if attempt == 2 and isinstance(error, RecoverableCopywritingWarning):
                    return result
                if attempt < 2:
                    current_prompt = (
                        f"{prompt}\n\n上一次返回没有通过结构校验。"
                        "请只返回修复后的完整 JSON，不要解释。"
                        f"\n校验错误：{last_error[:800]}"
                    )
        raise StructuredOutputError(
            f"Model output failed validation after 3 attempts: {last_error}"
        )

    def generate_topics(
        self, *, api_key: str, request: TopicGenerationRequest
    ) -> TopicResult:
        prompt = f"""你是抖音和视频号口播选题策划。根据以下资料生成恰好 5 个角度明显不同、可直接发展成口播稿的选题：
{_persona_context(request)}

要求：
1. 不虚构资料之外的事实、数据、客户案例或承诺。
2. shortTitle 必须是 5–8 个纯中文字符，用于视频标题和文件名。
3. description 用 20–80 字说明这条视频具体讲什么和论述方向。
4. hook 是可以直接开口讲的第一句话方向，不写动作或镜头提示。
5. 五个选题不得只是同义改写。
6. 只输出 JSON，不要 Markdown。
格式：{{"topics":[{{"id":"a","shortTitle":"同行低价真相","description":"解释低价竞争背后的质量代价","hook":"便宜一定真的省钱吗"}}]}}"""
        return self._structured(
            api_key=api_key, model=request.model, prompt=prompt, schema=TopicResult
        )

    def generate_copywriting(
        self, *, api_key: str, request: CopywritingGenerationRequest
    ) -> CopywritingResult:
        prompt = f"""你是短视频口播文案编辑。
资料：{_persona_context(request)}
选题：{request.topic}
禁用词：{json.dumps(request.banned_words, ensure_ascii=False)}

写一篇 {request.min_length} 到 {request.max_length} 字的中文口播稿。全文必须是本人可直接朗读的自述或对观众说话，不写括号动作、舞台提示、镜头说明、旁白标签或表演指令。每句话单独回车换行，每句话尽量不超过20个汉字。短句、口语化、强开场、价值明确、行动引导克制；不得虚构明确事实，不得出现禁用词。只输出 JSON：{{"text":"完整口播稿"}}"""

        def validate_copywriting(result: CopywritingResult) -> None:
            result.text = clean_spoken_copy(result.text)
            text_length = len("".join(result.text.split()))
            if text_length < request.min_length or text_length > request.max_length:
                raise ValueError(
                    f"copywriting length {text_length} is outside "
                    f"{request.min_length}-{request.max_length}"
                )
            matched_words = [
                word for word in request.banned_words if word and word in result.text
            ]
            if matched_words:
                raise RecoverableCopywritingWarning(
                    "copywriting contains banned words: " + ", ".join(matched_words[:10])
                )

        return self._structured(
            api_key=api_key, model=request.model, prompt=prompt,
            schema=CopywritingResult, post_validate=validate_copywriting,
        )


class ContentCreationService:
    def __init__(
        self, topic_service: TopicService,
        compliance_checker: ComplianceChecker | None = None,
    ) -> None:
        self.topic_service = topic_service
        self.compliance_checker = compliance_checker or ComplianceChecker()

    def generate_topics(
        self, *, api_key: str, request: TopicGenerationRequest
    ) -> TopicResult:
        return self.topic_service.generate_topics(api_key=api_key, request=request)

    def generate_copywriting(
        self, *, api_key: str, request: CopywritingGenerationRequest
    ) -> CopywritingResult:
        return self.topic_service.generate_copywriting(api_key=api_key, request=request)

    def check_compliance(self, request: ComplianceRequest) -> ComplianceResult:
        return self.compliance_checker.check(request)
