"""测试 PDF 生成助手：用 PyMuPDF 生成确定性的小 PDF。"""
from __future__ import annotations

from pathlib import Path

import pymupdf as fitz  # 1.28.2 的 fitz shim 会在 stdout 打印弃用警告（测试内无碍，但约定统一）


def make_text_pdf(path: Path, pages: int = 1) -> Path:
    """每页写入一行文本，返回 PDF 路径。"""
    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page()
        page.insert_text((72, 72), f"hello page {i + 1}", fontsize=12)
    doc.save(path)
    doc.close()
    return path


def make_image_only_pdf(path: Path) -> Path:
    """生成无文本层的 PDF（仅一张色块图片）。"""
    import struct

    doc = fitz.open()
    page = doc.new_page()
    w, h = 64, 64
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, w, h))
    for y in range(h):
        for x in range(w):
            pix.set_pixel(x, y, (200, 30, 30))
    page.insert_image(fitz.Rect(72, 72, 72 + w, 72 + h), pixmap=pix)
    doc.save(path)
    doc.close()
    return path
