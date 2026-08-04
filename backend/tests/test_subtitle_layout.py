from app.timeline.subtitle_layout import layout_subtitle_event, wrap_semantic_lines


def test_wraps_at_semantic_boundaries():
    lines = wrap_semantic_lines("这是第一句，接着解释原因，最后给出结论。", 8)
    assert all(len(line) <= 8 for line in lines)
    assert "".join(lines) == "这是第一句接着解释原因最后给出结论"


def test_long_subtitle_is_split_into_two_line_timed_events():
    result = layout_subtitle_event(
        start_sec=1,
        end_sec=5,
        text="每个袋子必须让使用者愿意背，这才是客户品牌曝光的核心。还要兼顾质量和传播。",
        font_size=80,
        outline_width=6,
    )
    assert len(result) >= 2
    assert all(len(item.text.split("\n")) <= 2 for item in result)
    assert result[0].start_sec == 1
    assert result[-1].end_sec == 5
    assert all(left.end_sec == right.start_sec for left, right in zip(result, result[1:]))


def test_wrap_never_splits_ascii_words_and_hides_terminal_punctuation():
    lines = wrap_semantic_lines("路人看到的是皱巴巴的logo和开线的边角。", 10)

    assert all("lo\ngo" not in line for line in lines)
    assert "".join(lines) == "路人看到的是皱巴巴的logo和开线的边角"
    assert all(not line.endswith(("。", "，", "！", "？")) for line in lines)
