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


def _short_lines(value: str, max_chars: int = 20) -> list[str]:
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


def clean_spoken_copy(text: str) -> str:
    cleaned = STAGE_DIRECTION.sub("", text)
    cleaned = LABELED_DIRECTION.sub("", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    lines: list[str] = []
    for block in cleaned.splitlines() or [cleaned]:
        for sentence in SENTENCE.findall(block):
            lines.extend(_short_lines(sentence))
    return "\n".join(lines)
