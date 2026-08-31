import pymupdf as fitz

from worker import rebuild
from worker.tests import fixtures


def test_overflow_scales_down_fontsize(tmp_path):
    src = fixtures.make_text_pdf(tmp_path / "src.pdf", pages=1)
    out = tmp_path / "out.pdf"
    # 极长译文 → 触发缩小字号路径
    long_text = "X" * 500
    result = rebuild.rebuild_document(
        {"inputPath": str(src), "outputPath": str(out),
         "pages": [{"index": 0, "paragraphs": [{"id": 0, "text": long_text}]}]}
    )
    doc = fitz.open(out)
    spans = doc[0].get_text("dict")["blocks"][0]["lines"][0]["spans"]
    doc.close()
    assert spans[0]["size"] < 12.0  # 字号被缩小


def test_overflow_reports_warning_when_unavoidable(tmp_path):
    src = fixtures.make_text_pdf(tmp_path / "src2.pdf", pages=1)
    out = tmp_path / "out2.pdf"
    huge = "Y" * 5000
    result = rebuild.rebuild_document(
        {"inputPath": str(src), "outputPath": str(out),
         "pages": [{"index": 0, "paragraphs": [{"id": 0, "text": huge}]}]}
    )
    assert any(w["kind"] == "overflow" for w in result["warnings"])
