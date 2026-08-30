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
