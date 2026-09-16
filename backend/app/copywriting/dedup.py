from __future__ import annotations

import math
import re
import unicodedata
from datetime import UTC, datetime, timedelta
from difflib import SequenceMatcher

from app.copywriting.content_identity import (
    ContentHistoryItem,
    DedupCandidate,
    DedupDecision,
)


_PUNCTUATION = re.compile(r"[^0-9a-z\u3400-\u9fff]+", re.IGNORECASE)
_SIMPLE_NUMERALS = str.maketrans({
    "零": "0", "〇": "0", "一": "1", "二": "2", "两": "2", "三": "3",
    "四": "4", "五": "5", "六": "6", "七": "7", "八": "8", "九": "9",
})


def normalize_content(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).lower().translate(_SIMPLE_NUMERALS)
    return _PUNCTUATION.sub("", normalized)


def _ngrams(value: str, size: int) -> set[str]:
    normalized = normalize_content(value)
    if not normalized:
        return set()
    if len(normalized) <= size:
        return {normalized}
    return {normalized[index:index + size] for index in range(len(normalized) - size + 1)}


def _jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def lexical_similarity(left: str, right: str) -> float:
    normalized_left = normalize_content(left)
    normalized_right = normalize_content(right)
    if not normalized_left or not normalized_right:
        return 0.0
    if normalized_left == normalized_right:
        return 1.0
    sequence = SequenceMatcher(None, normalized_left, normalized_right).ratio()
    characters = _jaccard(set(normalized_left), set(normalized_right))
    bigrams = _jaccard(_ngrams(normalized_left, 2), _ngrams(normalized_right, 2))
    trigrams = _jaccard(_ngrams(normalized_left, 3), _ngrams(normalized_right, 3))
    return max(sequence, characters * 0.9, bigrams, trigrams)


def cosine_similarity(left: list[float] | None, right: list[float] | None) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 0.0
    return sum(a * b for a, b in zip(left, right, strict=True)) / (left_norm * right_norm)


def _topic_text(item: DedupCandidate | ContentHistoryItem) -> str:
    return "|".join((item.display_title, item.description, item.hook))


def _materially_different(left: str, right: str) -> bool:
    return lexical_similarity(left, right) < 0.45


class ContentDeduplicator:
    def __init__(self, *, now: datetime | None = None, cooldown_days: int = 90) -> None:
        self.now = now or datetime.now(UTC)
        self.cooldown = timedelta(days=cooldown_days)

    def evaluate(
        self,
        candidate: DedupCandidate,
        history: list[ContentHistoryItem],
    ) -> DedupDecision:
        best_score = 0.0
        best_id: str | None = None
        for previous in history:
            decision = self._compare(candidate, previous)
            if decision.duplicate:
                return decision
            if decision.score > best_score:
                best_score = decision.score
                best_id = previous.id
        return DedupDecision(
            duplicate=False,
            reason_code="DISTINCT",
            matched_history_id=best_id,
            score=best_score,
            needs_judgment=0.72 <= best_score < 0.90,
        )

    def _compare(
        self,
        candidate: DedupCandidate,
        previous: ContentHistoryItem,
    ) -> DedupDecision:
        current_text = normalize_content(_topic_text(candidate))
        previous_text = normalize_content(_topic_text(previous))
        if current_text and current_text == previous_text:
            return self._duplicate("EXACT_DUPLICATE", previous.id, 1.0)

        title_score = lexical_similarity(candidate.display_title, previous.display_title)
        hook_score = lexical_similarity(candidate.hook, previous.hook)
        combined_score = lexical_similarity(_topic_text(candidate), _topic_text(previous))
        text_score = max(title_score, hook_score, combined_score)
        if title_score >= 0.92 or hook_score >= 0.94 or combined_score >= 0.90:
            return self._duplicate("LEXICAL_DUPLICATE", previous.id, text_score)

        semantic_score = cosine_similarity(candidate.semantic_vector, previous.semantic_vector)
        if semantic_score >= 0.92:
            return self._duplicate("SEMANTIC_DUPLICATE", previous.id, semantic_score)

        thesis_score = lexical_similarity(candidate.identity.thesis, previous.identity.thesis)
        thesis_match = thesis_score >= 0.48
        last_used_at = previous.last_used_at
        if last_used_at.tzinfo is None:
            last_used_at = last_used_at.replace(tzinfo=UTC)
        if thesis_match and self.now - last_used_at < self.cooldown:
            return self._duplicate(
                "RECENT_THESIS_DUPLICATE", previous.id, max(thesis_score, text_score)
            )
        if thesis_match:
            changed = sum((
                _materially_different(candidate.identity.audience, previous.identity.audience),
                _materially_different(candidate.identity.scenario, previous.identity.scenario),
                _materially_different(candidate.identity.evidence_type, previous.identity.evidence_type),
                _materially_different(candidate.identity.structure_type, previous.identity.structure_type),
            ))
            if changed < 3:
                return self._duplicate(
                    "COOLED_THESIS_INSUFFICIENT_CHANGE",
                    previous.id,
                    max(thesis_score, text_score),
                )
        return DedupDecision(
            duplicate=False,
            reason_code="DISTINCT",
            matched_history_id=previous.id,
            score=max(text_score, semantic_score, thesis_score * 0.85),
            needs_judgment=False,
        )

    @staticmethod
    def _duplicate(reason: str, history_id: str, score: float) -> DedupDecision:
        return DedupDecision(
            duplicate=True,
            reason_code=reason,
            matched_history_id=history_id,
            score=score,
            needs_judgment=False,
        )
