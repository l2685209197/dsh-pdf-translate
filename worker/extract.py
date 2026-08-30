"""文本层检测与段落提取。"""
from __future__ import annotations

from typing import Any

import pymupdf as fitz  # 1.28.2 的 fitz shim 会在 stdout 打印弃用警告，污染 stdio 协议


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
