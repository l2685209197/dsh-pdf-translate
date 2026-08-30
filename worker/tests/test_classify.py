from worker import extract
from worker.model import Line, Paragraph, Span


def _para(texts, font="Helvetica", size=12.0):
    lines = []
    for i, t in enumerate(texts):
        lines.append(
            Line(
                text=t,
                bbox=(72, 100 + i * 20, 300, 112 + i * 20),
                origin=(72, 108 + i * 20),
                spans=[Span(text=t, bbox=(72, 100 + i * 20, 300, 112 + i * 20), font=font, size=size, color="#000000", bold=False, italic=False, underline=False, origin=(72, 108 + i * 20))],
            )
        )
    return Paragraph(id=0, bbox=lines[0].bbox, first_line_anchor=lines[0].origin, lines=lines)


def test_code_detected_by_monospace_font():
    p = _para(["def f():", "    return 1"], font="CourierNewPSMT")
    extract.classify_paragraph(p)
    assert p.type == "code"


def test_heading_detected_by_size_jump():
    body_size = _para(["normal text"])
    p = _para(["Chapter Title"], size=18.0)
    extract.classify_paragraph(p, body_size=12.0)
    assert p.type == "heading"


def test_list_item_detected_by_bullet():
    p = _para(["- item one", "  wrapped line"])
    extract.classify_paragraph(p)
    assert p.type == "list-item"
