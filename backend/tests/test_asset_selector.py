import pytest

from app.timeline.asset_selector import (
    AssetCandidate,
    AssetSelectionError,
    AssetSelector,
    ShotRequirement,
)


def candidates(*names: str) -> list[AssetCandidate]:
    return [
        AssetCandidate(
            asset_id=name,
            category_id="factory",
            file_path=f"D:/media/{name}.mp4",
            duration_sec=8.0,
        )
        for name in names
    ]


def test_same_seed_produces_reproducible_selection() -> None:
    requirements = [
        ShotRequirement(index=index, category_id="factory", duration_sec=3)
        for index in range(4)
    ]

    first = AssetSelector(seed=42).select(requirements, candidates("a", "b", "c"))
    second = AssetSelector(seed=42).select(requirements, candidates("a", "b", "c"))

    assert first == second


def test_adjacent_shots_do_not_use_same_source_when_alternative_exists() -> None:
    requirements = [
        ShotRequirement(index=index, category_id="factory", duration_sec=3)
        for index in range(6)
    ]

    result = AssetSelector(seed=7).select(requirements, candidates("a", "b"))

    assert all(
        current.asset_id != following.asset_id
        for current, following in zip(result, result[1:], strict=False)
    )


def test_recent_same_position_usage_is_avoided() -> None:
    requirement = [ShotRequirement(index=0, category_id="factory", duration_sec=3)]
    history = {0: {"a", "b"}}

    result = AssetSelector(seed=3).select(
        requirement,
        candidates("a", "b", "fresh"),
        recent_usage=history,
    )

    assert result[0].asset_id == "fresh"


def test_reused_short_asset_loops_and_uses_different_start_ranges() -> None:
    requirements = [
        ShotRequirement(index=index, category_id="factory", duration_sec=12)
        for index in range(2)
    ]
    result = AssetSelector(seed=5).select(requirements, candidates("only"))

    assert result[0].loop is True
    assert result[1].loop is True
    assert result[0].source_start_sec != result[1].source_start_sec


def test_missing_category_fails_with_specific_shot() -> None:
    with pytest.raises(AssetSelectionError, match="shot 2.*people"):
        AssetSelector(seed=1).select(
            [ShotRequirement(index=2, category_id="people", duration_sec=3)],
            candidates("factory"),
        )
