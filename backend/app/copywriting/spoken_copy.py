from __future__ import annotations

import re


STAGE_DIRECTION = re.compile(
    r"[（(【\[].{0,24}?(?:叹气|叉腰|停顿|镜头|画面|旁白|敲黑板|转场|动作|表情).{0,24}?[）)】\]]"
)
LABELED_DIRECTION = re.compile(
    r"^(?:镜头|画面|旁白|动作|表情|转场)\s*[:：].*$", re.MULTILINE
)

SENTENCE = re.compile(r"[^。！？；\n]+[。！？；]?")
SOFT_BOUNDARIES = "，、：,"
TERMINATORS = "。！？；"


def _short_lines(value: str, max_chars: int = 25) -> list[str]:
    lines: list[str] = []
    remaining = value.strip()
    while remaining:
        if len(remaining.rstrip("，。！？；：")) <= max_chars:
            lines.append(remaining)
            break
        cut = max_chars
        for index in range(min(max_chars, len(remaining) - 1), 5, -1):
            if remaining[index - 1] in SOFT_BOUNDARIES:
                cut = index
                break
        line = remaining[:cut].strip()
        remaining = remaining[cut:].strip()
        if line:
            lines.append(line)
    return lines


def _finish(value: str, punctuation: str = "。") -> str:
    value = value.strip()
    return value if value.endswith(tuple("，。！？；：")) else value + punctuation


def _merge_short_lines(values: list[str], min_chars: int = 10, max_chars: int = 25) -> list[str]:
    merged: list[str] = []
    index = 0
    while index < len(values):
        current = values[index].strip()
        while len(current.rstrip("，。！？；：")) < min_chars and index + 1 < len(values):
            following = values[index + 1].strip()
            combined = current.rstrip("，。！？；：") + "，" + following
            if len(combined.rstrip("，。！？；：")) > max_chars:
                break
            current = combined
            index += 1
        if len(current.rstrip("，。！？；：")) < min_chars and merged:
            combined = merged[-1].rstrip("，。！？；：") + "，" + current
            if len(combined.rstrip("，。！？；：")) <= max_chars:
                merged[-1] = _finish(combined)
            else:
                merged.append(_finish(current))
        else:
            merged.append(_finish(current))
        index += 1
    return merged


def clean_spoken_copy(text: str) -> str:
    cleaned = STAGE_DIRECTION.sub("", text)
    cleaned = LABELED_DIRECTION.sub("", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    lines: list[str] = []
    for block in cleaned.splitlines() or [cleaned]:
        for sentence in SENTENCE.findall(block):
            pieces = _short_lines(sentence)
            for piece_index, piece in enumerate(pieces):
                if piece_index < len(pieces) - 1:
                    lines.append(_finish(piece, "，"))
                else:
                    lines.append(_finish(piece))
    return "\n".join(_merge_short_lines(lines))
