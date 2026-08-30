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


def _pred_groups_for(pdf, texts):
    doc = fitz.open(pdf)
    try:
        lines = extract._extract_lines_from_pdf(doc, 0)
        page = doc[0]
        paras = extract.cluster_paragraphs(lines, page.rect.width, page.rect.height)
    finally:
        doc.close()
    idx = {t: i for i, t in enumerate(texts)}
    groups = [[idx[l.text] for l in p.lines if l.text in idx] for p in paras]
    return [g for g in groups if g]


def test_golden_set_precision_recall(tmp_path):
    for pdf, texts, gold_groups in golden.build_golden_set(tmp_path):
        pred_groups = _pred_groups_for(pdf, texts)
        pred, gold = _pairs(pred_groups), _pairs(gold_groups)
        if gold:
            # gold 含多行段落：pred 为空即提取失败（不可跳过）
            assert pred, f"{pdf.name}: no lines extracted"
            p = len(pred & gold) / len(pred)
            r = len(pred & gold) / len(gold)
            threshold = 0.95 if pdf.name == "single.pdf" else 0.8
            assert p >= threshold, f"{pdf.name}: precision {p}"
            assert r >= threshold, f"{pdf.name}: recall {r}"
        else:
            # gold 全单行（表格/单元格）：任何段落不得包含 >1 个 gold 行
            for g in pred_groups:
                assert len(g) <= 1, f"{pdf.name}: over-merged paragraph {g}"


def test_extract_command(tmp_path):
    pdf = golden.build_golden_set(tmp_path)[0][0]
    result = extract.extract_pages({"path": str(pdf), "start": 0, "end": 0})
    assert len(result["pages"]) == 1
    paras = result["pages"][0]["paragraphs"]
    assert len(paras) == 2
    assert paras[0]["type"] == "body"
    assert len(paras[0]["lines"]) == 3
    assert "bbox" in paras[0] and "firstLineAnchor" in paras[0]
    assert paras[0]["confidence"] == 1.0  # 协议字段：正常页置信度 1.0
    assert paras[0]["table"] is None  # v1 不填充 table 元数据


def test_heading_fixture_mode_body_size(tmp_path):
    # 标题夹具：_body_size_of_page 必须是众数（12.0）而非 max（18），
    # 否则标题判为 body——直接回归锁定 Task 11 的核心修复
    cases = golden.build_golden_set(tmp_path)
    pdf = next(c[0] for c in cases if c[0].name == "heading.pdf")
    doc = fitz.open(pdf)
    try:
        body = extract._body_size_of_page(doc, 0)
        paras = extract._paragraphs_of_page(doc, 0, body_size=body)
    finally:
        doc.close()
    assert body == 12.0
    assert paras[0].type == "heading"
    assert paras[1].type == "body"
