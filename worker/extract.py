"""文本层检测与段落提取。"""
from __future__ import annotations

from dataclasses import dataclass
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


@dataclass
class ColumnAssignment:
    ordered: list[Line]  # 阅读顺序
    full_width: list[Line]  # 跨栏元素（标题等），单独处理


def _is_full_width(line: Line, page_width: float) -> bool:
    return (line.bbox[2] - line.bbox[0]) >= page_width * 0.8


def assign_columns(lines: list[Line], page_width: float) -> ColumnAssignment:
    """x 轴投影聚类成列；输出阅读顺序（每列内自上而下，列按 x 从左到右）。"""
    full_width = [l for l in lines if _is_full_width(l, page_width)]
    body = [l for l in lines if not _is_full_width(l, page_width)]

    columns: list[list[Line]] = []
    for line in sorted(body, key=lambda l: (l.bbox[1], l.bbox[0])):
        placed = False
        for col in columns:
            # 与列内任一行的 x 范围重叠即归入该列
            if _overlaps_x(line, col[-1]):
                col.append(line)
                placed = True
                break
        if not placed:
            columns.append([line])

    columns.sort(key=lambda col: min(l.bbox[0] for l in col))
    ordered = [l for col in columns for l in sorted(col, key=lambda l: l.bbox[1])]
    ordered = full_width + ordered
    return ColumnAssignment(ordered=ordered, full_width=full_width)


def _overlaps_x(a: Line, b: Line) -> bool:
    a0, _, a1, _ = a.bbox
    b0, _, b1, _ = b.bbox
    return min(a1, b1) - max(a0, b0) > 1.0
