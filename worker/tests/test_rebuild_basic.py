import pymupdf as fitz

from worker import rebuild
from worker.tests import fixtures


def _payload(src, out, page_index, items):
    return {"inputPath": str(src), "outputPath": str(out),
            "pages": [{"index": page_index, "paragraphs": items}]}


def test_rebuild_replaces_text(tmp_path):
    src = fixtures.make_text_pdf(tmp_path / "src.pdf", pages=1)
    out = tmp_path / "out.pdf"
    result = rebuild.rebuild_document(_payload(src, out, 0, [{"id": 0, "text": "translated line"}]))
    doc = fitz.open(out)
    text = doc[0].get_text("text")
    doc.close()
    assert "translated line" in text
    assert "hello page 1" not in text


def test_rebuild_keeps_image(tmp_path):
    doc = fitz.open()
    page = doc.new_page()
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 32, 32))
    pix.clear_with(0x20A0B0)
    page.insert_image(fitz.Rect(72, 300, 200, 400), pixmap=pix)
    page.insert_text((72, 100), "cover me", fontsize=12)
    src = tmp_path / "img.pdf"
    doc.save(src)
    doc.close()
    out = tmp_path / "img_out.pdf"
    rebuild.rebuild_document(_payload(src, out, 0, [{"id": 0, "text": "译文"}]))
    doc = fitz.open(out)
    assert len(doc[0].get_images()) == 1
    doc.close()
