from worker import extract
from worker.model import Line, Span


def _line(x0, y0, x1, y1, text="t"):
    return Line(text=text, bbox=(x0, y0, x1, y1), origin=(x0, y1 - 10))


def test_two_columns_reading_order():
    # 左栏两行 + 右栏两行
    lines = [
        _line(50, 50, 200, 60, "L1"),
        _line(50, 70, 200, 80, "L2"),
        _line(350, 50, 500, 60, "R1"),
        _line(350, 70, 500, 80, "R2"),
    ]
    result = extract.assign_columns(lines, page_width=600)
    # 阅读顺序：L1, L2, R1, R2
    assert [l.text for l in result.ordered] == ["L1", "L2", "R1", "R2"]
    # 全宽行（标题）单独成段
    lines2 = [_line(50, 10, 550, 20, "TITLE"), *lines]
    result2 = extract.assign_columns(lines2, page_width=600)
    assert result2.ordered[0].text == "TITLE"


def test_right_column_starts_higher():
    # 右栏起始行比左栏高：列序仍按 x（左→右），不按创建顺序
    lines = [
        _line(350, 20, 500, 30, "R0"),
        _line(50, 50, 200, 60, "L1"),
        _line(50, 70, 200, 80, "L2"),
        _line(350, 40, 500, 50, "R1"),
    ]
    result = extract.assign_columns(lines, page_width=600)
    assert [l.text for l in result.ordered] == ["L1", "L2", "R0", "R1"]


def test_gutter_spanning_line_promoted_to_full_width():
    # 宽度 < 80% 页宽但横跨两列 gutter 的行（长 URL/公式）→ 聚类前按 ≥0.5 页宽
    # 预提升为全宽，不吞并相邻列（防列坍缩）
    lines = [
        _line(50, 40, 200, 70, "L1"),
        _line(100, 45, 450, 60, "WIDE"),
        _line(350, 50, 500, 60, "R1"),
        _line(350, 62, 500, 72, "R2"),
        _line(50, 72, 200, 82, "L2"),
    ]
    result = extract.assign_columns(lines, page_width=600)
    assert "WIDE" in [l.text for l in result.full_width]
    # 列内容不坍缩：左列 [L1,L2]、右列 [R1,R2]，bridge 行按 y 置头部
    assert [l.text for l in result.ordered] == ["WIDE", "L1", "L2", "R1", "R2"]
