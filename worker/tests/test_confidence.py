from worker import extract
from worker.model import Line, Paragraph, Span


def _line(x0, y0, x1, y1, text="t"):
    bbox = (x0, y0, x1, y1)
    return Line(
        text=text, bbox=bbox, origin=(x0, y1 - 10),
        # 夹具行需携带 span：cluster_paragraphs → _same_style 读取 spans[0]
        spans=[Span(text=text, bbox=bbox, font="Helvetica", size=12.0, color="#000000",
                    bold=False, italic=False, underline=False, origin=(x0, y1 - 10))],
    )


def test_clean_page_high_confidence():
    lines = [_line(72, 100, 300, 112), _line(72, 112, 300, 124)]
    paras = extract.cluster_paragraphs(lines, page_width=600, page_height=800)
    score = extract.page_confidence(paras)
    assert score > 0.9


def test_overlapping_lines_low_confidence():
    # 重叠行 → 低置信度 → 降级为逐行段落
    lines = [
        _line(72, 100, 300, 300, "a"),
        _line(100, 100, 350, 300, "b"),  # 与上一行大面积重叠
    ]
    paras = extract.cluster_paragraphs(lines, page_width=600, page_height=800)
    score = extract.page_confidence(paras)
    assert score < 0.7
    degraded = extract.apply_fallback(paras)
    assert all(len(p.lines) == 1 for p in degraded)


def test_apply_fallback_preserves_order():
    lines = [_line(72, 100, 300, 112, "a"), _line(72, 112, 300, 124, "b")]
    paras = extract.cluster_paragraphs(lines, page_width=600, page_height=800)
    degraded = extract.apply_fallback(paras)
    assert [p.lines[0].text for p in degraded] == ["a", "b"]
