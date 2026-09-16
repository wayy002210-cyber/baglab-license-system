from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ContentIdentity(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    audience: str = Field(min_length=1, max_length=80)
    scenario: str = Field(min_length=1, max_length=80)
    problem: str = Field(min_length=1, max_length=160)
    thesis: str = Field(min_length=1, max_length=160)
    evidence_type: str = Field(alias="evidenceType", min_length=1, max_length=80)
    angle: str = Field(min_length=1, max_length=80)
    structure_type: str = Field(alias="structureType", min_length=1, max_length=80)
    hook_type: str = Field(alias="hookType", min_length=1, max_length=80)
    viewer_gain: str = Field(alias="viewerGain", min_length=1, max_length=160)
    hotspot_id: str | None = Field(default=None, alias="hotspotId", max_length=160)


class HotspotSource(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(min_length=1, max_length=160)
    title: str = Field(min_length=1, max_length=200)
    source_url: str = Field(alias="sourceUrl", min_length=1, max_length=2000)
    published_at: date = Field(alias="publishedAt")
    retrieved_at: datetime = Field(alias="retrievedAt")
    summary: str = Field(min_length=1, max_length=500)
    relevance: str = Field(min_length=1, max_length=300)


class DedupCandidate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(min_length=1)
    display_title: str = Field(alias="displayTitle", min_length=1, max_length=80)
    short_title: str = Field(alias="shortTitle", min_length=1, max_length=30)
    description: str = Field(min_length=1, max_length=500)
    hook: str = Field(min_length=1, max_length=300)
    identity: ContentIdentity
    semantic_vector: list[float] | None = Field(default=None, alias="semanticVector")


class ContentHistoryItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(min_length=1)
    content_type: Literal["topic", "script"] = Field(alias="contentType")
    lifecycle_state: str = Field(alias="lifecycleState", min_length=1)
    display_title: str = Field(default="", alias="displayTitle")
    short_title: str = Field(default="", alias="shortTitle")
    description: str = ""
    hook: str = ""
    content_text: str = Field(default="", alias="contentText")
    identity: ContentIdentity
    semantic_vector: list[float] | None = Field(default=None, alias="semanticVector")
    last_used_at: datetime = Field(alias="lastUsedAt")


class DedupDecision(BaseModel):
    duplicate: bool
    reason_code: str
    matched_history_id: str | None = None
    score: float = 0.0
    needs_judgment: bool = False
