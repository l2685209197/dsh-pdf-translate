"""黄金测试集：单栏 / 双栏 / 图文混排 / 表格 / 代码 5 类版式。"""
from __future__ import annotations

from pathlib import Path

import pymupdf as fitz


def _build(tmp: Path, name: str, lines: list[tuple[float, float, str, str, float]]) -> Path:
    doc = fitz.open()
    page = doc.new_page()
    for x, y, text, font, size in lines:
        page.insert_text((x, y), text, fontsize=size, fontname=font)
    path = tmp / name
    doc.save(path)
    doc.close()
    return path


def build_golden_set(tmp: Path):
    cases = []

    # 1. 单栏：3 行一段 + 空行 + 2 行一段
    texts = ["first line", "second line", "third line", "next para a", "next para b"]
    lines = [(72, 100 + i * 14, t, "helv", 12) for i, t in enumerate(texts[:3])] + \
            [(72, 165 + i * 14, t, "helv", 12) for i, t in enumerate(texts[3:])]
    cases.append((_build(tmp, "single.pdf", lines), texts, [[0, 1, 2], [3, 4]]))

    # 2. 双栏：左栏两段 + 右栏两段
    texts = ["L1a", "L1b", "L2a", "L2b"]
    lines = [(72, 100, "L1a", "helv", 12), (72, 114, "L1b", "helv", 12),
             (350, 100, "L2a", "helv", 12), (350, 114, "L2b", "helv", 12)]
    cases.append((_build(tmp, "two.pdf", lines), texts, [[0, 1], [2, 3]]))

    # 3. 图文混排：文-图-文（各一行）
    texts = ["text before image", "text after image"]
    lines = [(72, 100, texts[0], "helv", 12), (72, 260, texts[1], "helv", 12)]
    cases.append((_build(tmp, "mixed.pdf", lines), texts, [[0], [1]]))

    # 4. 表格：3x2 单元格（每格一行；行距 48pt：12pt 行 bbox 高 ~16.5pt，
    #    行间 bbox 间隙 31.5 > 阈值 0.6×48=28.8，保证每格独立成段）
    texts = [f"c{r}{c}" for r in range(3) for c in range(2)]
    lines = [(72 + c * 200, 100 + r * 48, texts[r * 2 + c], "helv", 12) for r in range(3) for c in range(2)]
    cases.append((_build(tmp, "table.pdf", lines), texts, [[i] for i in range(6)]))

    # 5. 代码块：等宽 4 行
    texts = ["def f():", "    return 1", "x = f()", "# done"]
    lines = [(72, 100 + i * 14, t, "courier", 12) for i, t in enumerate(texts)]
    cases.append((_build(tmp, "code.pdf", lines), texts, [[0, 1, 2, 3]]))

    return cases
