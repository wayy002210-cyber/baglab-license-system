from __future__ import annotations

from dataclasses import dataclass
import re


@dataclass(frozen=True)
class LaidOutSubtitle:
    start_sec: float
    end_sec: float
    text: str


_SEMANTIC_BOUNDARY = re.compile(r"(?<=[。！？；，、：,.!?;:])")


def estimate_line_capacity(
    *,
    font_size: float,
    scale: float = 100,
    letter_spacing: float = 0,
    outline_width: float = 0,
    canvas_width: int = 1080,
    horizontal_margin: int = 90,
) -> int:
    usable_width = max(120.0, canvas_width - horizontal_margin * 2 - outline_width * 4)
    glyph_width = max(1.0, font_size * max(scale, 1) / 100 + letter_spacing)
    return max(4, int(usable_width / glyph_width))


def wrap_semantic_lines(text: str, max_chars: int) -> list[str]:
    normalized = re.sub(r"\s+", "", text or "").strip()
    if not normalized:
        return []
    chunks = [chunk for chunk in _SEMANTIC_BOUNDARY.split(normalized) if chunk]
    lines: list[str] = []
    current = ""
    for chunk in chunks:
        while chunk:
            remaining = max_chars - len(current)
            if remaining <= 0:
                lines.append(current)
                current = ""
                remaining = max_chars
            if len(chunk) <= remaining:
                current += chunk
                chunk = ""
                continue
            if current:
                lines.append(current)
                current = ""
                continue
            lines.append(chunk[:max_chars])
            chunk = chunk[max_chars:]
    if current:
        lines.append(current)
    return lines


def layout_subtitle_event(
    *,
    start_sec: float,
    end_sec: float,
    text: str,
    font_size: float,
    scale: float = 100,
    letter_spacing: float = 0,
    outline_width: float = 0,
    canvas_width: int = 1080,
    max_lines: int = 2,
) -> list[LaidOutSubtitle]:
    capacity = estimate_line_capacity(
        font_size=font_size,
        scale=scale,
        letter_spacing=letter_spacing,
        outline_width=outline_width,
        canvas_width=canvas_width,
    )
    lines = wrap_semantic_lines(text, capacity)
    if not lines:
        return []
    pages = [lines[index:index + max_lines] for index in range(0, len(lines), max_lines)]
    if len(pages) == 1:
        return [LaidOutSubtitle(start_sec, end_sec, "\n".join(pages[0]))]

    duration = max(0.01, end_sec - start_sec)
    weights = [max(1, sum(len(line) for line in page)) for page in pages]
    total_weight = sum(weights)
    cursor = start_sec
    result: list[LaidOutSubtitle] = []
    for index, (page, weight) in enumerate(zip(pages, weights, strict=True)):
        page_end = end_sec if index == len(pages) - 1 else cursor + duration * weight / total_weight
        result.append(LaidOutSubtitle(cursor, page_end, "\n".join(page)))
        cursor = page_end
    return result
