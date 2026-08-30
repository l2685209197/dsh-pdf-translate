"""文本层检测与段落提取。"""
from __future__ import annotations

from typing import Any

import pymupdf as fitz  # 1.28.2 的 fitz shim 会在 stdout 打印弃用警告，污染 stdio 协议

from worker.model import Line, Span


def text_layer_info(payload: dict[str, Any]) -> dict[str, Any]:
    """检测文档文本层：逐页统计可提取字符数。"""
    path = payload["path"]
    doc = fitz.open(path)
    try:
        pages = []
        total = 0
        for i in range(doc.page_count):
            chars = len(doc[i].get_text("text").rstrip("\n"))  # 去掉提取器追加的行尾 \n
            total += chars
            pages.append({"index": i, "charCount": chars})
        return {"pageCount": doc.page_count, "hasTextLayer": total > 0, "pages": pages}
    finally:
        doc.close()


def extract_pages(payload: dict[str, Any]) -> dict[str, Any]:
    raise NotImplementedError("Task 6-11")


def _span_flags(flags: int) -> dict[str, bool]:
    """PyMuPDF span flags：2^0 superscript, 2^1 italic, 2^2 serifed, 2^3 monospaced, 2^4 bold。"""
    return {
        "bold": bool(flags & (1 << 4)),
        "italic": bool(flags & (1 << 1)),
        "underline": False,  # PyMuPDF dict 不直接给下划线；由字体名启发式兜底
    }


def _color_to_hex(color: int) -> str:
    return "#{:06x}".format(color & 0xFFFFFF)


def _lines_from_dict(page_dict: dict[str, Any]) -> list[Line]:
    """把 page.get_text('dict') 归一化为 Line 列表（相邻 span 合成一个 Line）。"""
    lines: list[Line] = []
    for block in page_dict.get("blocks", []):
        if block.get("type") != 0:  # 只处理文本块
            continue
        for raw_line in block.get("lines", []):
            spans: list[Span] = []
            for raw_span in raw_line.get("spans", []):
                text = raw_span.get("text", "")
                if not text.strip():
                    continue
                bbox = tuple(float(v) for v in raw_span["bbox"])
                spans.append(
                    Span(
                        text=text,
                        bbox=bbox,
                        font=raw_span["font"],
                        size=float(raw_span["size"]),
                        color=_color_to_hex(raw_span.get("color", 0)),
                        origin=tuple(float(v) for v in raw_span.get("origin", (0, 0))),
                        **_span_flags(raw_span.get("flags", 0)),
                    )
                )
            if not spans:
                continue
            bbox = tuple(float(v) for v in raw_line["bbox"])
            lines.append(
                Line(
                    text="".join(s.text for s in spans),
                    bbox=bbox,
                    spans=spans,
                    origin=spans[0].origin,
                )
            )
    return lines


def _extract_lines_from_pdf(doc: fitz.Document, page_index: int) -> list[Line]:
    return _lines_from_dict(doc[page_index].get_text("dict"))
