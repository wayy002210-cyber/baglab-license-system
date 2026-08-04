from __future__ import annotations

import re


STAGE_DIRECTION = re.compile(
    r"[（(【\[].{0,24}?(?:叹气|叉腰|停顿|镜头|画面|旁白|敲黑板|转场|动作|表情).{0,24}?[）)】\]]"
)
LABELED_DIRECTION = re.compile(
    r"^(?:镜头|画面|旁白|动作|表情|转场)\s*[:：].*$", re.MULTILINE
)


def clean_spoken_copy(text: str) -> str:
    cleaned = STAGE_DIRECTION.sub("", text)
    cleaned = LABELED_DIRECTION.sub("", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()
