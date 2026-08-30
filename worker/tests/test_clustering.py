from worker import extract
from worker.model import Line


def _line(x0, y0, x1, y1, text="t", size=12.0, font="Helvetica"):
    return Line(text=text, bbox=(x0, y0, x1, y1), origin=(x0, y1 - size * 0.8))


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
