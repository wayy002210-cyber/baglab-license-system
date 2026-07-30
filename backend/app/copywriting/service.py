from __future__ import annotations

import json
import re
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator


Role = Literal["hook", "problem", "proof", "solution", "cta", "custom"]
DurationMode = Literal["voice", "fixed", "auto"]


class RequestedShot(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    index: int = Field(ge=0)
    role: Role
    asset_category_id: str = Field(alias="assetCategoryId", min_length=1)


class RewriteRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source_text: str = Field(alias="sourceText", min_length=1)
    model: str = "deepseek-v3"
    persona_name: str = Field(alias="personaName", min_length=1)
    brand_facts: list[str] = Field(alias="brandFacts")
    tone: str = ""
    cta: str = ""
    banned_words: list[str] = Field(default_factory=list, alias="bannedWords")
    shots: list[RequestedShot] = Field(min_length=1, max_length=30)


class GeneratedShot(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    index: int = Field(ge=0)
    role: Role
    asset_category_id: str = Field(alias="assetCategoryId", min_length=1)
    copywriting: str = Field(min_length=1, max_length=500)
    duration_mode: DurationMode = Field(alias="durationMode")
    duration_sec: float | None = Field(default=None, alias="durationSec", gt=0)
    mute_original: bool = Field(alias="muteOriginal")

    @model_validator(mode="after")
    def validate_fixed_duration(self) -> "GeneratedShot":
        if self.duration_mode == "fixed" and self.duration_sec is None:
            raise ValueError("fixed duration requires durationSec")
        return self


class RewriteResult(BaseModel):
    shots: list[GeneratedShot]


class ChatCompletion(Protocol):
    def complete(self, *, api_key: str, model: str, prompt: str) -> str: ...


class StructuredOutputError(RuntimeError):
    pass


def _extract_json(text: str) -> dict:
    cleaned = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", cleaned, re.DOTALL)
    if fenced:
        cleaned = fenced.group(1)
    return json.loads(cleaned)


def _base_prompt(request: RewriteRequest) -> str:
    shot_contract = [
        {
            "index": shot.index,
            "role": shot.role,
            "assetCategoryId": shot.asset_category_id,
        }
        for shot in request.shots
    ]
    return f"""你是短视频口播文案编辑。请把原始材料改写为严格匹配镜头模板的口播句。

账号档案：
- 名称：{request.persona_name}
- 已确认事实：{json.dumps(request.brand_facts, ensure_ascii=False)}
- 表达风格：{request.tone}
- 行动引导：{request.cta}
- 禁用词：{json.dumps(request.banned_words, ensure_ascii=False)}

原始材料：
{request.source_text}

镜头契约：
{json.dumps(shot_contract, ensure_ascii=False)}

规则：
1. 只能使用原始材料和已确认事实中的信息，不得补充未经提供的数据、客户案例或承诺。
2. shots 数量、index、role、assetCategoryId 必须与镜头契约完全一致。
3. 每个 copywriting 是一句可直接配音的中文短句。
4. durationMode 固定返回 "voice"，muteOriginal 固定返回 true。
5. 不得出现禁用词。
6. 只输出 JSON，不要 Markdown。

返回格式：
{{"shots":[{{"index":0,"role":"hook","assetCategoryId":"分类ID","copywriting":"口播句","durationMode":"voice","muteOriginal":true}}]}}"""


class CopywritingService:
    def __init__(self, chat: ChatCompletion) -> None:
        self.chat = chat

    def rewrite(
        self, *, api_key: str, model: str, request: RewriteRequest
    ) -> RewriteResult:
        base_prompt = _base_prompt(request)
        prompt = base_prompt
        last_error = "unknown validation error"
        for attempt in range(3):
            text = self.chat.complete(api_key=api_key, model=model, prompt=prompt)
            try:
                result = RewriteResult.model_validate(_extract_json(text))
                self._validate_contract(request, result)
                return result
            except (json.JSONDecodeError, ValidationError, ValueError) as error:
                last_error = str(error)
                if attempt < 2:
                    prompt = (
                        f"{base_prompt}\n\n"
                        "上一次输出无法通过校验，请修复格式并重新输出完整 JSON。"
                        f"\n校验错误：{last_error[:800]}"
                    )
        raise StructuredOutputError(
            f"Model output failed validation after 3 attempts: {last_error}"
        )

    @staticmethod
    def _validate_contract(
        request: RewriteRequest, result: RewriteResult
    ) -> None:
        if len(request.shots) != len(result.shots):
            raise ValueError("shot count does not match template")
        for expected, generated in zip(request.shots, result.shots, strict=True):
            if (
                expected.index != generated.index
                or expected.role != generated.role
                or expected.asset_category_id != generated.asset_category_id
            ):
                raise ValueError("generated shot changed the template contract")
            if generated.duration_mode != "voice" or not generated.mute_original:
                raise ValueError("generated shot changed fixed audio settings")
            if any(
                word and word in generated.copywriting
                for word in request.banned_words
            ):
                raise ValueError("generated copy contains a banned word")
