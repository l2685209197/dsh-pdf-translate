from worker import extract
from worker.model import Line, Span


def _line(x0, y0, x1, y1, text="t", size=12.0, font="Helvetica"):
    bbox = (x0, y0, x1, y1)
    return Line(
        text=text, bbox=bbox, origin=(x0, y1 - size * 0.8),
        # 夹具行需携带 span：_same_style 读取 spans[0]（生产数据恒有 ≥1 span）
        spans=[Span(text=text, bbox=bbox, font=font, size=size, color="#000000",
                    bold=False, italic=False, underline=False, origin=(x0, y1 - size * 0.8))],
    )


def test_merge_close_lines_same_style():
    lines = [
        _line(72, 100, 300, 112, "line one", size=12),
        _line(72, 112, 300, 124, "line two", size=12),
        _line(72, 124, 300, 136, "line three", size=12),
    ]
    paras = extract.cluster_paragraphs(lines, page_width=600, page_height=800)
    assert len(paras) == 1
    assert len(paras[0].lines) == 3


def test_big_gap_breaks_paragraph():
    lines = [
        _line(72, 100, 300, 112, "para one"),
        _line(72, 160, 300, 172, "para two"),  # 60pt 间隙
    ]
    paras = extract.cluster_paragraphs(lines, page_width=600, page_height=800)
    assert len(paras) == 2


def test_first_line_indent_starts_new_paragraph():
    lines = [
        _line(72, 100, 300, 112, "first para"),
        _line(96, 112, 300, 124, "indented start of second"),  # 缩进 24pt
        _line(72, 124, 300, 136, "continues second"),
    ]
    paras = extract.cluster_paragraphs(lines, page_width=600, page_height=800)
    assert len(paras) == 2
    assert paras[1].lines[0].bbox[0] == 96


def test_style_change_breaks_paragraph():
    lines = [
        _line(72, 100, 300, 112, "normal line", size=12, font="Helvetica"),
        _line(72, 112, 300, 124, "bigger line", size=14, font="Helvetica"),
    ]
    paras = extract.cluster_paragraphs(lines, page_width=600, page_height=800)
    assert len(paras) == 2


def test_column_seam_flushes_paragraph():
    # 两列各一段（Task 7 修订：列边界无条件分段，列缝 y 间隙为负也不跨列合并）
    lines = [
        _line(50, 50, 200, 60, "L1a", size=12),
        _line(50, 62, 200, 72, "L1b", size=12),
        _line(350, 20, 500, 30, "R1a", size=12),
        _line(350, 32, 500, 42, "R1b", size=12),
    ]
    paras = extract.cluster_paragraphs(lines, page_width=600, page_height=800)
    assert len(paras) == 2


def test_hanging_indent_list_keeps_continuation():
    # 挂起缩进：bullet 行 + 缩进续行不拆断；下一项起始强制分段
    lines = [
        _line(72, 100, 300, 112, "- item one", size=12),
        _line(96, 112, 300, 124, "  wrapped line", size=12),
        _line(72, 124, 300, 136, "- next item", size=12),
    ]
    paras = extract.cluster_paragraphs(lines, page_width=600, page_height=800)
    assert len(paras) == 2
    assert [l.text for l in paras[0].lines] == ["- item one", "  wrapped line"]
