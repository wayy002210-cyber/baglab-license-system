from __future__ import annotations

import random
from collections import Counter
from dataclasses import dataclass
from pathlib import Path


SUPPORTED_SUFFIXES = {".mp4", ".mov", ".mkv", ".webm", ".avi"}


class AssetSelectionError(RuntimeError):
    pass


@dataclass(frozen=True)
class AssetCandidate:
    asset_id: str
    category_id: str
    file_path: str
    duration_sec: float
    status: str = "ready"

    @property
    def selectable(self) -> bool:
        return (
            self.status == "ready"
            and self.duration_sec > 0
            and Path(self.file_path).suffix.lower() in SUPPORTED_SUFFIXES
        )


@dataclass(frozen=True)
class ShotRequirement:
    index: int
    category_id: str
    duration_sec: float


@dataclass(frozen=True)
class SelectedAsset:
    shot_index: int
    asset_id: str
    file_path: str
    source_start_sec: float
    source_duration_sec: float
    asset_duration_sec: float
    loop: bool


class AssetSelector:
    """Select assets deterministically while avoiding visible repetition."""

    def __init__(self, *, seed: int | str) -> None:
        self.random = random.Random(str(seed))

    def select(
        self,
        requirements: list[ShotRequirement],
        assets: list[AssetCandidate],
        *,
        recent_usage: dict[int, set[str]] | None = None,
    ) -> list[SelectedAsset]:
        recent_usage = recent_usage or {}
        usage_count: Counter[str] = Counter()
        selected: list[SelectedAsset] = []
        previous_asset_id: str | None = None

        for shot in requirements:
            category_assets = [
                asset
                for asset in assets
                if asset.category_id == shot.category_id and asset.selectable
            ]
            if not category_assets:
                raise AssetSelectionError(
                    f"shot {shot.index} has no readable assets in category "
                    f"{shot.category_id}"
                )

            candidates = self._preferred_candidates(
                category_assets,
                previous_asset_id=previous_asset_id,
                recent_asset_ids=recent_usage.get(shot.index, set()),
            )
            asset = self.random.choice(sorted(candidates, key=lambda item: item.asset_id))
            start = self._source_start(
                asset=asset,
                requested_duration=shot.duration_sec,
                reuse_index=usage_count[asset.asset_id],
            )
            selected.append(
                SelectedAsset(
                    shot_index=shot.index,
                    asset_id=asset.asset_id,
                    file_path=asset.file_path,
                    source_start_sec=round(start, 3),
                    source_duration_sec=shot.duration_sec,
                    asset_duration_sec=asset.duration_sec,
                    loop=asset.duration_sec < shot.duration_sec,
                )
            )
            usage_count[asset.asset_id] += 1
            previous_asset_id = asset.asset_id

        return selected

    @staticmethod
    def _preferred_candidates(
        assets: list[AssetCandidate],
        *,
        previous_asset_id: str | None,
        recent_asset_ids: set[str],
    ) -> list[AssetCandidate]:
        not_adjacent = [
            asset for asset in assets if asset.asset_id != previous_asset_id
        ]
        adjacency_pool = not_adjacent or assets
        not_recent = [
            asset for asset in adjacency_pool if asset.asset_id not in recent_asset_ids
        ]
        return not_recent or adjacency_pool

    def _source_start(
        self,
        *,
        asset: AssetCandidate,
        requested_duration: float,
        reuse_index: int,
    ) -> float:
        if asset.duration_sec > requested_duration:
            maximum = asset.duration_sec - requested_duration
            base = self.random.uniform(0, maximum)
            return (base + reuse_index * maximum * 0.381966) % maximum
        if asset.duration_sec > 0:
            base = self.random.uniform(0, asset.duration_sec)
            return (
                base + reuse_index * asset.duration_sec * 0.381966
            ) % asset.duration_sec
        return 0
