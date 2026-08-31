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


def _cover_and_write(
    page: fitz.Page, para: dict[str, Any], text: str, resolver: FontResolver
) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    rect = fitz.Rect(*para["bbox"])
    first_span = para["lines"][0]["spans"][0]
    anchor_x, anchor_y = first_span["origin"]
    fontsize = float(first_span["size"])
    color = _hex_to_rgb(first_span["color"])
    # Task 19：写入前先解析字体——CJK 译文必须落到 CJK 字体（helv 度量严重偏窄，
    # 否则 bbox 不扩宽、译文在原文框内折行）。
    fontname, fontfile = resolver.resolve(font=first_span["font"], text=text, lang="")

    page.add_redact_annot(rect, fill=(1, 1, 1))
    # 注：pymupdf 1.28.2 的 apply_redactions 签名是 (images, graphics, text)，
    # 已无 annots 参数（旧版 PDF_REDACT_ANNOTS_* 常量随之移除）。此版本行为：
    # 非链接注释保留；**与 redaction 区域相交的链接注释（URI link）会被删除**——
    # Task 21 需做链接捕获-恢复，不能依赖默认保留。
    page.apply_redactions(
        images=fitz.PDF_REDACT_IMAGE_NONE,
        graphics=fitz.PDF_REDACT_LINE_ART_NONE,
        text=fitz.PDF_REDACT_TEXT_REMOVE,
    )

    write_rect = fitz.Rect(rect.x0, anchor_y - fontsize, rect.x1, rect.y1 + 50)
    # 译文可能比原文宽（如 "translated line" 74.7pt vs 原 bbox 65.4pt）；按译文在解析后
    # 字体下的自然宽度扩右边，避免 insert_textbox 折行。get_text_length 无 fontfile 参数
    # （1.28.2 签名只有 text/fontname/fontsize/encoding），文件字体改用 fitz.Font 度量。
    if fontfile is not None:
        text_width = fitz.Font(fontname=fontname, fontfile=fontfile).text_length(text, fontsize=fontsize)
    else:
        text_width = fitz.get_text_length(text, fontname=fontname, fontsize=fontsize)
    if rect.x0 + text_width > write_rect.x1:
        write_rect.x1 = rect.x0 + text_width + 1.0
    used = page.insert_textbox(
        write_rect,
        text,
        fontsize=fontsize,
        color=color,
        align=fitz.TEXT_ALIGN_LEFT,
        fontname=fontname,
        fontfile=fontfile,
    )
    if used < 0:
        warnings.append({"page": page.number, "paraId": para["id"], "kind": "overflow", "detail": "text does not fit"})
    return warnings


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
            for item in page_payload.get("paragraphs", []):
                para_id = int(item["id"])
                text = item["text"]
                para = geometry.get(para_id)
                if para is None:
                    warnings.append({"page": index, "paraId": para_id, "kind": "empty", "detail": "geometry not found"})
                    continue
                if not text.strip():
                    continue
                warnings.extend(_cover_and_write(page, para, text, resolver))
        doc.save(output_path, incremental=False, garbage=3, deflate=True)
        return {"warnings": warnings}
    finally:
        doc.close()


_BASE14 = {
    "helvetica": ("helv", None),
    "helvetica-bold": ("hebo", None),
    "times": ("tiro", None),
    "times-roman": ("tiro", None),
    "courier": ("cour", None),
    "couriernew": ("cour", None),
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
