"""PDF 重建：redaction 删除原文本 + insert_textbox 写入译文。"""
from __future__ import annotations

import os
import re
from typing import Any

import pymupdf as fitz  # 1.28.2 的 fitz shim 会在 stdout 打印弃用警告，污染 stdio 协议

from worker import extract


def _extract_geometry(doc: fitz.Document, page_index: int) -> list[dict[str, Any]]:
    """重建时重新提取页面段落，得到 id → (bbox, anchor, fontsize, color) 几何表。"""
    body = extract._body_size_of_page(doc, page_index)
    paras = extract._paragraphs_of_page(doc, page_index, body_size=body)
    return [p.to_dict() for p in paras]


def _geometry_map(page_paras: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    return {p["id"]: p for p in page_paras}


def _hex_to_rgb(color: str) -> tuple[float, float, float]:
    """'#rrggbb' → (r, g, b) 浮点分量（0..1）。

    extract 的 Span.color 是 '#rrggbb' 字符串；pymupdf 1.28.2 的 insert_textbox
    只接受 0..1 数值分量（旧版支持 hex 字符串的写法已移除）。
    """
    value = color.lstrip("#")
    return tuple(int(value[i : i + 2], 16) / 255.0 for i in (0, 2, 4))


def _write_translation(page: fitz.Page, para: dict[str, Any], text: str, resolver: FontResolver) -> list[dict[str, Any]]:
    """把译文写入段落锚点区域（不负责 redaction——由调用方两阶段批量处理）。

    两阶段重建的原因（真实使用发现，见 test_rebuild_overlapping_paragraphs_keep_both_translations）：
    书名页等版式里相邻段落的 bbox 纵向重叠（大字号作者行 + 紧贴其下的小字号单位行）。
    旧实现逐段落「redact → 写」，后一段落的 redact 矩形会覆盖已写入的上一段译文，
    apply_redactions 把相交字符删除（如 'Rafael C. ' 丢失、只剩 'onzalez'）。
    正确顺序：先一次性删除本页全部原文，再统一写回全部译文。
    """
    warnings: list[dict[str, Any]] = []
    rect = fitz.Rect(*para["bbox"])
    first_span = para["lines"][0]["spans"][0]
    anchor_y = first_span["origin"][1]
    fontsize = float(first_span["size"])
    color = _hex_to_rgb(first_span["color"])

    warnings.extend(
        _write_with_overflow_handling(page, para["id"], text, rect, anchor_y, fontsize, color, resolver, first_span["font"])
    )
    return warnings


def _write_with_overflow_handling(
    page: fitz.Page, para_id: int, text: str, rect: fitz.Rect,
    anchor_y: float, fontsize: float, color: tuple[float, float, float],
    resolver: FontResolver, font: str,
) -> list[dict[str, Any]]:
    """溢出三级链：① 微缩字号（≥0.8×）→ ② 放宽行距 → ③ 区域外溢逐行写入并标注。

    color 为 RGB 0..1 元组（_hex_to_rgb 产物）；宽度按解析后字体扩右边（Task 19），
    避免单行译文在段落宽度内提前折行——本链处理的是**纵向**放不下的情况。
    """
    warnings: list[dict[str, Any]] = []
    fontname, fontfile = resolver.resolve(font=font, text=text, lang="")
    write_rect = fitz.Rect(rect.x0, anchor_y - fontsize, rect.x1, rect.y1 + 50)
    if fontfile is not None:
        try:
            text_width = fitz.Font(fontname=fontname, fontfile=fontfile).text_length(text, fontsize=fontsize)
        except Exception:  # noqa: BLE001
            text_width = fitz.get_text_length(text, fontname="china-s", fontsize=fontsize)
    else:
        text_width = fitz.get_text_length(text, fontname=fontname, fontsize=fontsize)
    if rect.x0 + text_width > write_rect.x1:
        # 扩宽但有界：上限为页面右缘。无界扩宽会让任何文本都能排成单行
        # （矩形高度 ~65pt >> 单行 ~14pt），纵向溢出永远不可达、三级链形同虚设；
        # 封顶后极端长译文才会在页面宽度内折行，链 ① 才有机会触发。
        write_rect.x1 = min(rect.x0 + text_width + 1.0, page.rect.x1)

    # 三级链 ①：微缩字号（≥ 0.8× 原字号）
    size = fontsize
    last_tried = fontsize
    while size >= fontsize * 0.8:
        used = page.insert_textbox(
            write_rect, text, fontsize=size, color=color,
            align=fitz.TEXT_ALIGN_LEFT, fontname=fontname, fontfile=fontfile,
            lineheight=1.2,
        )
        if used >= 0:
            if size < fontsize - 0.5:
                warnings.append({"page": page.number, "paraId": para_id, "kind": "overflow",
                                 "detail": f"fontsize scaled {fontsize:.1f}→{size:.1f}"})
            return warnings
        last_tried = size
        size = round(size * 0.9, 2)
    # 循环退出时 size 已指向未尝试的下一档（可能跌破 0.8× 下限）；回退到最后尝试过的档位，
    # 让链 ②/③ 使用仍在 ≥0.8× 下限内的字号。
    size = last_tried

    # 三级链 ②：放宽行距到 1.4（简单起见重试一次 lineheight）
    for lineheight in (1.4,):
        used = page.insert_textbox(
            write_rect, text, fontsize=size, color=color,
            align=fitz.TEXT_ALIGN_LEFT, fontname=fontname, fontfile=fontfile,
            lineheight=lineheight,
        )
        if used >= 0:
            return warnings

    # 三级链 ③：允许溢出——逐行写入（超出段落区域底边），并标注
    y = anchor_y
    for raw_line in text.splitlines() or [text]:
        line_text = raw_line if raw_line else " "
        page.insert_text((rect.x0, y), line_text, fontsize=size, color=color,
                         fontname=fontname, fontfile=fontfile)
        y += size * 1.2
    warnings.append({"page": page.number, "paraId": para_id, "kind": "overflow",
                     "detail": "text written beyond paragraph region"})
    return warnings


_REDACT_PAD = 2.0  # redaction 覆盖矩形的外扩边距（捕获链接与覆盖共用，防漂移）


def _redact_rect(para: dict[str, Any]) -> fitz.Rect:
    """redaction 覆盖矩形 = 段落 bbox 外扩 _REDACT_PAD pt。

    _capture_links 与 _cover_and_write 共用同一构造：若只按未扩宽的 bbox 捕获，
    落在 2pt 边带内的链接会被 redaction 删除却未被捕获（静默丢失）。
    """
    return fitz.Rect(*para["bbox"]) + (-_REDACT_PAD, -_REDACT_PAD, _REDACT_PAD, _REDACT_PAD)


def _capture_links(page: fitz.Page, rects: list[fitz.Rect]) -> list[dict[str, Any]]:
    """捕获与任一待 redact 段落矩形相交的链接（redaction 会删除它们）。"""
    captured: list[dict[str, Any]] = []
    for link in page.get_links():
        link_rect = fitz.Rect(link.get("from"))
        if any(link_rect.intersects(r) for r in rects):
            captured.append(link)
    return captured


def _restore_links(page: fitz.Page, links: list[dict[str, Any]]) -> None:
    """恢复捕获的链接；仅补回 redaction 后已不存在的（避免重复）。"""
    for link in links:
        link_rect = fitz.Rect(link.get("from"))
        if not any(fitz.Rect(existing.get("from")) == link_rect for existing in page.get_links()):
            page.insert_link(link)


def _redact_page(page: fitz.Page, rects: list[fitz.Rect]) -> None:
    """一次性删除本页所有待替换段落的原文（两阶段重建的第 ① 阶段）。

    注：pymupdf 1.28.2 的 apply_redactions 签名是 (images, graphics, text)，
    已无 annots 参数（旧版 PDF_REDACT_ANNOTS_* 常量随之移除）。此版本行为：
    非链接注释保留；**与 redaction 区域相交的链接注释（URI link）会被删除**——
    调用方必须先用 _capture_links 捕获、_restore_links 恢复。
    """
    for rect in rects:
        page.add_redact_annot(rect, fill=(1, 1, 1))
    page.apply_redactions(
        images=fitz.PDF_REDACT_IMAGE_NONE,
        graphics=fitz.PDF_REDACT_LINE_ART_NONE,
        text=fitz.PDF_REDACT_TEXT_REMOVE,
    )


def rebuild_document(payload: dict[str, Any]) -> dict[str, Any]:
    input_path = payload["inputPath"]
    output_path = payload["outputPath"]
    pages = payload["pages"]
    doc = fitz.open(input_path)
    warnings: list[dict[str, Any]] = []
    resolver = FontResolver()
    try:
        for page_payload in pages:
            index = int(page_payload["index"])
            page = doc[index]
            geometry = _geometry_map(_extract_geometry(doc, index))
            # Task 21：pymupdf 1.28.2 的 redaction 会删除与区域相交的链接注释，
            # 先捕获本页将被 redact 的段落矩形相交的链接，写完后恢复。
            # 捕获矩形与 _redact_rect 的覆盖矩形必须一致（_redact_rect 共享），
            # 否则 2pt 边带内的链接会被删除却未捕获。
            redact_rects: list[fitz.Rect] = []
            write_items: list[tuple[dict[str, Any], str]] = []
            for item in page_payload.get("paragraphs", []):
                para_id = int(item["id"])
                para = geometry.get(para_id)
                text = item.get("text", "")
                if para is None:
                    warnings.append({"page": index, "paraId": para_id, "kind": "empty", "detail": "geometry not found"})
                    continue
                if not text.strip():
                    continue  # 空译文段落保留原文（不 redact、不写）
                redact_rects.append(_redact_rect(para))
                write_items.append((para, text))
            # 两阶段重建（2026-09-01 真实使用修复）：先删除本页全部原文，
            # 再统一写入全部译文——逐段落「redact→写」会让后段 redaction 删掉
            # 已写入的前段译文（段落 bbox 纵向重叠时，如书名页大字号行+小字号行）。
            captured_links = _capture_links(page, redact_rects)
            _redact_page(page, redact_rects)
            for para, text in write_items:
                warnings.extend(_write_translation(page, para, text, resolver))
            _restore_links(page, captured_links)
        doc.save(output_path, incremental=False, garbage=3, deflate=True)
        return {"warnings": warnings}
    finally:
        doc.close()


_BASE14 = {
    # 顺序关键：更长前缀（helvetica-bold）必须在前，否则 startswith("helvetica")
    # 先命中、bold 权重静默丢失（hebo 不可达）
    "helvetica-bold": ("hebo", None),
    "helvetica": ("helv", None),
    "times-roman": ("tiro", None),
    "times": ("tiro", None),
    "couriernew": ("cour", None),
    "courier": ("cour", None),
    "symbol": ("symb", None),
    "zapfdingbats": ("zadb", None),
}

_CJK_RE = re.compile(r"[\u3000-\u9fff\uf900-\ufaff]")

_MSYH = r"C:\Windows\Fonts\msyh.ttc"


class FontResolver:
    """把原字体名映射到 PyMuPDF 可用的 (fontname, fontfile)。缺字形时回退到 CJK/无衬线。"""

    def __init__(self) -> None:
        self._cache: dict[str, tuple[str, str | None]] = {}

    def resolve(self, font: str, text: str, lang: str) -> tuple[str, str | None]:
        key = f"{font}|{lang}|{bool(_CJK_RE.search(text))}"
        if key in self._cache:
            return self._cache[key]
        result = self._resolve(font, text, lang)
        self._cache[key] = result
        return result

    def _resolve(self, font: str, text: str, lang: str) -> tuple[str, str | None]:
        lowered = font.lower()
        # 注意：CJK 需求必须先于 base-14 映射判断——base-14 字体（Helvetica/Times…）
        # 没有 CJK 字形，含 CJK 的译文必须回退（test_cjk_fallback_for_latin_font）。
        needs_cjk = bool(_CJK_RE.search(text)) or lang.startswith("zh") or lang.startswith("ja") or lang.startswith("ko")
        if needs_cjk:
            if os.path.exists(_MSYH):
                return ("msyh", _MSYH)
            return ("china-s", None)  # PyMuPDF 内置 CJK 字体
        for prefix, mapped in _BASE14.items():
            if lowered.startswith(prefix):
                return mapped
        if re.search(r"(?i)mono|courier|consolas", lowered):
            return ("cour", None)
        return ("helv", None)
