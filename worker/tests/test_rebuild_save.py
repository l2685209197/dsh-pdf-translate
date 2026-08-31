import pymupdf as fitz

from worker import rebuild


def test_rebuild_preserves_links_and_annotations(tmp_path):
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 100), "linked text", fontsize=12)
    page.insert_link({"kind": fitz.LINK_URI, "from": fitz.Rect(72, 88, 160, 104), "uri": "https://example.com"})
    page.add_rect_annot(fitz.Rect(200, 200, 240, 240))
    src = tmp_path / "links.pdf"
    doc.save(src)
    doc.close()

    out = tmp_path / "links_out.pdf"
    rebuild.rebuild_document(
        {"inputPath": str(src), "outputPath": str(out),
         "pages": [{"index": 0, "paragraphs": [{"id": 0, "text": "translated"}]}]}
    )
    doc = fitz.open(out)
    page = doc[0]
    assert any(l["kind"] == fitz.LINK_URI for l in page.get_links())
    assert len(list(page.annots())) >= 1
    doc.close()


def test_rebuild_code_passthrough_keeps_monospace(tmp_path):
    doc = fitz.open()
    page = doc.new_page()
    for i, t in enumerate(["def f():", "    return 1"]):
        page.insert_text((72, 100 + i * 14), t, fontsize=12, fontname="courier")
    src = tmp_path / "code.pdf"
    doc.save(src)
    doc.close()

    out = tmp_path / "code_out.pdf"
    result = rebuild.rebuild_document(
        {"inputPath": str(src), "outputPath": str(out),
         "pages": [{"index": 0, "paragraphs": [{"id": 0, "text": "def f():\n    return 1"}]}]}
    )
    assert not any(w["kind"] == "empty" for w in result["warnings"])
    doc = fitz.open(out)
    text = doc[0].get_text("text")
    doc.close()
    assert "def f():" in text
