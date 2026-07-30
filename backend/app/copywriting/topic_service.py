from __future__ import annotations

import json
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.copywriting.compliance import (
    ComplianceChecker,
    ComplianceRequest,
    ComplianceResult,
)
from app.copywriting.service import StructuredOutputError, _extract_json


class ChatCompletion(Protocol):
    def complete(self, *, api_key: str, model: str, prompt: str) -> str: ...


class TopicCandidate(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=80)
    angle: str = Field(min_length=1, max_length=100)
    hook: str = Field(min_length=1, max_length=120)


class TopicResult(BaseModel):
    topics: list[TopicCandidate] = Field(min_length=5, max_length=5)

    @model_validator(mode="after")
    def require_unique_topics(self) -> "TopicResult":
        titles = [topic.title.strip() for topic in self.topics]
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


def _persona_context(request: TopicGenerationRequest) -> str:
    return json.dumps(
        {
            "人设": request.persona_name,
            "行业": request.industry,
            "已确认事实": request.brand_facts,
            "语气": request.tone,
            "行动引导": request.cta,
            "参考脚本结构": request.reference_scripts,
        },
        ensure_ascii=False,
    )


class TopicService:
    def __init__(self, chat: ChatCompletion) -> None:
        self.chat = chat

    def _structured(self, *, api_key: str, model: str, prompt: str, schema):
        current_prompt = prompt
        last_error = ""
        for attempt in range(3):
            response = self.chat.complete(
                api_key=api_key, model=model, prompt=current_prompt
            )
            try:
                return schema.model_validate(_extract_json(response))
            except (json.JSONDecodeError, ValidationError, ValueError) as error:
                last_error = str(error)
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
        prompt = f"""你是抖音和视频号口播选题策划。
根据以下资料生成恰好 5 个角度明显不同、可直接发展成口播稿的选题：
{_persona_context(request)}

要求：
1. 不虚构资料之外的事实、数据、客户案例或承诺。
2. 标题口语化，开场能在三秒内说明问题、反差或收益。
3. 五个选题不得只是同义改写。
4. 只输出 JSON，不要 Markdown。
格式：{{"topics":[{{"id":"a","title":"标题","angle":"内容角度","hook":"开场钩子"}}]}}"""
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

写一篇 {request.min_length} 到 {request.max_length} 字的中文口播稿。
要求短句、口语化、强开场、价值明确、行动引导克制；
不得虚构明确事实，不得出现禁用词。只输出 JSON：
{{"text":"完整口播稿"}}"""
        result = self._structured(
            api_key=api_key,
            model=request.model,
            prompt=prompt,
            schema=CopywritingResult,
        )
        text_length = len("".join(result.text.split()))
        if text_length < request.min_length or text_length > request.max_length:
            raise StructuredOutputError(
                f"copywriting length {text_length} is outside "
                f"{request.min_length}-{request.max_length}"
            )
        if any(word and word in result.text for word in request.banned_words):
            raise StructuredOutputError("copywriting contains a banned word")
        return result


class ContentCreationService:
    def __init__(
        self,
        topic_service: TopicService,
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
        return self.topic_service.generate_copywriting(
            api_key=api_key, request=request
        )

    def check_compliance(self, request: ComplianceRequest) -> ComplianceResult:
        return self.compliance_checker.check(request)
