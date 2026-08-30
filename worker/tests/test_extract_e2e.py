import pymupdf as fitz

from worker import extract
from worker.tests import golden


def _pairs(groups):
    result = set()
    for group in groups:
        for a in range(len(group)):
            for b in range(a + 1, len(group)):
                result.add((group[a], group[b]))
    return result


def test_golden_set_precision_recall(tmp_path):
    for pdf, texts, gold_groups in golden.build_golden_set(tmp_path):
        doc = fitz.open(pdf)
        lines = extract._extract_lines_from_pdf(doc, 0)
        doc.close()
        paras = extract.cluster_paragraphs(lines, page_width=595, page_height=842)
        idx = {t: i for i, t in enumerate(texts)}
        pred_groups = [[idx[l.text] for l in p.lines if l.text in idx] for p in paras]
        pred_groups = [g for g in pred_groups if g]
        pred, gold = _pairs(pred_groups), _pairs(gold_groups)
        if not pred:
            continue
        p = len(pred & gold) / len(pred)
        r = (len(pred & gold) / len(gold)) if gold else 1.0
        threshold = 0.95 if pdf.name == "single.pdf" else 0.8
        assert p >= threshold, f"{pdf.name}: precision {p}"
        assert r >= threshold, f"{pdf.name}: recall {r}"


def test_extract_command(tmp_path):
    pdf = golden.build_golden_set(tmp_path)[0][0]
    result = extract.extract_pages({"path": str(pdf), "start": 0, "end": 0})
    assert len(result["pages"]) == 1
    paras = result["pages"][0]["paragraphs"]
    assert len(paras) == 2
    assert paras[0]["type"] == "body"
    assert len(paras[0]["lines"]) == 3
    assert "bbox" in paras[0] and "firstLineAnchor" in paras[0]
