import json

from worker import extract
from worker.tests import fixtures


def test_text_layer_present(tmp_path):
    pdf = fixtures.make_text_pdf(tmp_path / "t.pdf", pages=2)
    result = extract.text_layer_info({"path": str(pdf)})
    assert result["pageCount"] == 2
    assert result["hasTextLayer"] is True
    assert [p["charCount"] for p in result["pages"]] == [len("hello page 1"), len("hello page 2")]


def test_text_layer_absent(tmp_path):
    pdf = fixtures.make_image_only_pdf(tmp_path / "i.pdf")
    result = extract.text_layer_info({"path": str(pdf)})
    assert result["hasTextLayer"] is False
