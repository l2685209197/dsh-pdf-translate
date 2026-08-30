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


def test_proportional_source_font_is_not_code():
    # 回归：SourceHanSansSC（思源黑体）等比例字体不得误判为等宽（旧正则 source|code 会误报）
    p = _para(["中文正文段落"], font="SourceHanSansSC")
    extract.classify_paragraph(p)
    assert p.type == "body"


def test_inline_mono_run_does_not_classify_prose_as_code():
    # 回归：正文中内联等宽 span（如标识符）不把整段判为 code——主导样式判定（首行首 span）
    bbox = (72, 100, 300, 112)
    line = Line(
        text="Use foo() in the next() call",
        bbox=bbox,
        origin=(72, 108),
        spans=[
            Span(text="Use foo() in the ", bbox=bbox, font="Helvetica", size=12.0, color="#000000", bold=False, italic=False, underline=False, origin=(72, 108), mono=False),
            Span(text="next() call", bbox=bbox, font="CourierNewPSMT", size=12.0, color="#000000", bold=False, italic=False, underline=False, origin=(150, 108), mono=True),
        ],
    )
    p = Paragraph(id=0, bbox=bbox, first_line_anchor=line.origin, lines=[line])
    extract.classify_paragraph(p)
    assert p.type == "body"


def test_mono_flag_classifies_code():
    # span.mono（PyMuPDF flags 2^3）直接判等宽，即使字体名无等宽特征
    p = _para(["print(1)"], font="SomeSubsetFont")
    p.lines[0].spans[0].mono = True
    extract.classify_paragraph(p)
    assert p.type == "code"
