from worker import extract
from worker.model import Line, Span


def test_lines_from_dict_merges_adjacent_spans():
    page_dict = {
        "blocks": [
            {
                "type": 0,
                "bbox": (10, 10, 200, 30),
                "lines": [
                    {
                        "bbox": (10, 10, 200, 30),
                        "dir": (1, 0),
                        "spans": [
                            {
                                "text": "Hello",
                                "bbox": (10, 10, 60, 30),
                                "origin": (10, 25),
                                "font": "Helvetica",
                                "size": 12.0,
                                "flags": 2 ** 4,  # bold bit
                                "color": 0x000000,
                            },
                            {
                                "text": " world",
                                "bbox": (60, 10, 120, 30),
                                "origin": (60, 25),
                                "font": "Helvetica",
                                "size": 12.0,
                                "flags": 0,
                                "color": 0xFF0000,
                            },
                        ],
                    }
                ],
            }
        ]
    }
    lines = extract._lines_from_dict(page_dict)
    assert len(lines) == 1
    line = lines[0]
    assert isinstance(line, Line)
    assert line.text == "Hello world"
    assert len(line.spans) == 2
    s0 = line.spans[0]
    assert isinstance(s0, Span)
    assert s0.bold is True and s0.italic is False
    assert s0.color == "#000000"
    assert line.spans[1].color == "#ff0000"
