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


def test_mixed_page_singletons_do_not_trigger_fallback():
    # 回归：混合页面（合法单行内容占多数 + 一个正确聚类的多行段落）不得因
    # 单行占比触发降级——旧公式（0.5×单行占比）会误伤正确聚类的多行段落
    lines = [
        _line(72, 100, 300, 112, "s1"),
        _line(72, 140, 300, 152, "s2"),
        _line(72, 180, 300, 192, "s3"),
        _line(72, 220, 300, 232, "s4"),
        _line(72, 260, 300, 272, "s5"),
        _line(72, 300, 300, 312, "p1"),
        _line(72, 312, 300, 324, "p2"),
    ]
    paras = extract.cluster_paragraphs(lines, page_width=600, page_height=800)
    assert len(paras) == 6  # 5 单行 + 1 两行
    assert any(len(p.lines) == 2 for p in paras)  # 正确聚类的多行段落存在
    assert extract.page_confidence(paras) >= 0.6  # 旧公式（含单行惩罚）会 < 0.6
