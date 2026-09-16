from __future__ import annotations

import re
from collections.abc import Iterable

from pydantic import BaseModel, ConfigDict, Field

from app.copywriting.content_identity import ContentHistoryItem
from app.copywriting.dedup import lexical_similarity, normalize_content


class ScriptDraft(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    text: str = Field(min_length=1)
    structure_type: str = Field(default="", alias="structureType", max_length=80)
    hook_type: str = Field(default="", alias="hookType", max_length=80)
    argument_beats: list[str] = Field(
        default_factory=list, alias="argumentBeats", max_length=12
    )


class ScriptSignature(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    opening: str
    argument_sequence: list[str] = Field(alias="argumentSequence")
    shingles: list[str]
    examples: list[str]
    cta: str
    structure_type: str = Field(alias="structureType")
    hook_type: str = Field(alias="hookType")


class ScriptReviewResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    accepted: bool
    reason_codes: list[str] = Field(alias="reasonCodes")
    rewrite_instruction: str = Field(alias="rewriteInstruction")
    signature: ScriptSignature


def _lines(text: str) -> list[str]:
    return [
        part.strip()
        for part in re.split(r"[\r\n]+|(?<=[。！？!?])", text)
        if normalize_content(part)
    ]


def _shingles(text: str, size: int = 6) -> set[str]:
    normalized = normalize_content(text)
    if len(normalized) < size:
        return {normalized} if normalized else set()
    return {normalized[index:index + size] for index in range(len(normalized) - size + 1)}


def _overlap(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / min(len(left), len(right))


def _examples(lines: Iterable[str]) -> list[str]:
    markers = ("比如", "例如", "举个例子", "拿", "假设")
    return [normalize_content(line) for line in lines if any(word in line for word in markers)]


def _argument_order_matches(beats: list[str], previous_lines: list[str]) -> bool:
    normalized_beats = [normalize_content(beat) for beat in beats if normalize_content(beat)]
    normalized_lines = [normalize_content(line) for line in previous_lines]
    if len(normalized_beats) < 2:
        return False
    positions: list[int] = []
    start = 0
    for beat in normalized_beats:
        best_index = -1
        best_score = 0.0
        for index in range(start, len(normalized_lines)):
            line = normalized_lines[index]
            score = 1.0 if beat in line or line in beat else lexical_similarity(beat, line)
            if score > best_score:
                best_index, best_score = index, score
        if best_index < 0 or best_score < 0.45:
            return False
        positions.append(best_index)
        start = best_index + 1
    return positions == sorted(positions)


class ScriptReviewer:
    def fingerprint(self, draft: ScriptDraft) -> ScriptSignature:
        lines = _lines(draft.text)
        opening = normalize_content("".join(lines[:3]))
        cta = normalize_content("".join(lines[-2:])) if lines else ""
        return ScriptSignature(
            opening=opening,
            argumentSequence=[normalize_content(beat) for beat in draft.argument_beats],
            shingles=sorted(_shingles(draft.text)),
            examples=_examples(lines),
            cta=cta,
            structureType=draft.structure_type,
            hookType=draft.hook_type,
        )

    def review(
        self, draft: ScriptDraft, history: list[ContentHistoryItem]
    ) -> ScriptReviewResult:
        signature = self.fingerprint(draft)
        reasons: list[str] = []
        for previous in history:
            if previous.content_type != "script" or not previous.content_text.strip():
                continue
            previous_lines = _lines(previous.content_text)
            previous_opening = normalize_content("".join(previous_lines[:3]))
            if (
                signature.opening
                and previous_opening
                and lexical_similarity(signature.opening, previous_opening) >= 0.72
            ):
                reasons.append("OPENING_DUPLICATE")
            if _argument_order_matches(draft.argument_beats, previous_lines):
                reasons.append("ARGUMENT_ORDER_DUPLICATE")
            if _overlap(set(signature.shingles), _shingles(previous.content_text)) >= 0.62:
                reasons.append("SCRIPT_SHINGLE_DUPLICATE")
            previous_examples = _examples(previous_lines)
            if signature.examples and previous_examples and any(
                lexical_similarity(left, right) >= 0.78
                for left in signature.examples for right in previous_examples
            ):
                reasons.append("EXAMPLE_DUPLICATE")
            previous_cta = normalize_content("".join(previous_lines[-2:]))
            if (
                signature.cta and previous_cta
                and lexical_similarity(signature.cta, previous_cta) >= 0.86
            ):
                reasons.append("CTA_DUPLICATE")

        reason_codes = list(dict.fromkeys(reasons))
        hard_reasons = {
            "OPENING_DUPLICATE",
            "ARGUMENT_ORDER_DUPLICATE",
            "SCRIPT_SHINGLE_DUPLICATE",
        }
        accepted = not any(reason in hard_reasons for reason in reason_codes)
        if accepted:
            instruction = ""
        elif len([reason for reason in reason_codes if reason in hard_reasons]) > 1:
            instruction = "改用不同结构、不同开场和不同论证顺序，保留选题事实但整篇重新组织。"
        else:
            labels = "、".join(reason_codes)
            instruction = f"只重写重复部分（{labels}），同时保持事实边界和口播自然度。"
        return ScriptReviewResult(
            accepted=accepted,
            reasonCodes=reason_codes,
            rewriteInstruction=instruction,
            signature=signature,
        )
