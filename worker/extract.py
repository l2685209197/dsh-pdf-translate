"""文本层检测与段落提取。"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import pymupdf as fitz  # 1.28.2 的 fitz shim 会在 stdout 打印弃用警告，污染 stdio 协议

from worker.model import Line, Paragraph, Span


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


_ID_BASE = 1_000_000  # 段落 id 全局化：page_index * _ID_BASE + 页内序


def _paragraphs_of_page(doc: fitz.Document, page_index: int, body_size: float | None) -> list[Paragraph]:
    lines = _extract_lines_from_pdf(doc, page_index)
    if not lines:
        return []
    page = doc[page_index]
    paras = cluster_paragraphs(lines, page.rect.width, page.rect.height)
    for p in paras:
        classify_paragraph(p, body_size)
    if page_confidence(paras) < 0.6:
        paras = apply_fallback(paras)
    # Task 29 QA 发现的缺陷修复：cluster_paragraphs 的 id 是每页从 0 开始的局部编号，
    # TS 流水线的 translations 映射按裸 id 键控 → 跨页碰撞（多页文档每页都写入最后一页
    # 的译文）。extract 与 rebuild 的 _extract_geometry 同用本函数，全局化后两侧一致。
    for p in paras:
        p.id += page_index * _ID_BASE
    return paras


def _body_size_of_page(doc: fitz.Document, page_index: int) -> float:
    """页内正文字号基准：span 字号众数（最常见字号）。max() 会被页内标题等
    大字号抬高、使标题判定失效（标题 18pt + 正文 12pt 时 max=18 → 阈值 25.2，
    18pt 标题判为 body）；众数对均匀正文稳健。"""
    sizes = [s.size for l in _extract_lines_from_pdf(doc, page_index) for s in l.spans]
    if not sizes:
        return 12.0
    counter: dict[float, int] = {}
    for s in sizes:
        key = round(s, 1)
        counter[key] = counter.get(key, 0) + 1
    # 众数；平局时取较小字号（正文更可能是小字号）
    return min(counter, key=lambda k: (-counter[k], k))


def extract_pages(payload: dict[str, Any]) -> dict[str, Any]:
    path = payload["path"]
    start = max(0, int(payload.get("start", 0)))  # 负索引在 PyMuPDF 中回绕，必须钳制
    end = int(payload.get("end", 0))
    doc = fitz.open(path)
    try:
        pages = []
        for i in range(start, min(end, doc.page_count - 1) + 1):
            body = _body_size_of_page(doc, i)
            paras = _paragraphs_of_page(doc, i, body_size=body)
            pages.append({"index": i, "paragraphs": [p.to_dict() for p in paras]})
        return {"pages": pages}
    finally:
        doc.close()


def _span_flags(flags: int) -> dict[str, bool]:
    """PyMuPDF span flags：2^0 superscript, 2^1 italic, 2^2 serifed, 2^3 monospaced, 2^4 bold。"""
    return {
        "bold": bool(flags & (1 << 4)),
        "italic": bool(flags & (1 << 1)),
        "underline": False,  # PyMuPDF dict 不直接给下划线；由字体名启发式兜底
        "mono": bool(flags & (1 << 3)),
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
    full_width: list[Line]  # 跨栏/全宽元素（标题、横跨多列的 bridge 行），按 y 排序
    columns: list[list[Line]]  # 列内行（每列自上而下），供段落聚类在列边界无条件分段


def _is_full_width(line: Line, page_width: float) -> bool:
    return (line.bbox[2] - line.bbox[0]) >= page_width * 0.8


def _is_spanning(line: Line, page_width: float) -> bool:
    """宽度 ≥ 0.5 页宽视为跨栏/长行（URL、公式等），预提升为全宽，防列坍缩。"""
    return (line.bbox[2] - line.bbox[0]) >= page_width * 0.5


def assign_columns(lines: list[Line], page_width: float) -> ColumnAssignment:
    """x 轴投影聚类成列；输出阅读顺序（每列内自上而下，列按 x 从左到右）。"""
    full_width = [l for l in lines if _is_full_width(l, page_width) or _is_spanning(l, page_width)]
    body = [l for l in lines if l not in full_width]

    columns: list[list[Line]] = []
    for line in sorted(body, key=lambda l: (l.bbox[1], l.bbox[0])):
        placed = False
        for col in columns:
            # 与列内最后一行 x 范围重叠即归入该列
            if _overlaps_x(line, col[-1]):
                col.append(line)
                placed = True
                break
        if not placed:
            columns.append([line])

    columns.sort(key=lambda col: min(l.bbox[0] for l in col))
    ordered = [l for col in columns for l in sorted(col, key=lambda l: l.bbox[1])]
    ordered = sorted(full_width, key=lambda l: l.bbox[1]) + ordered
    return ColumnAssignment(ordered=ordered, full_width=full_width, columns=columns)


def _overlaps_x(a: Line, b: Line) -> bool:
    a0, _, a1, _ = a.bbox
    b0, _, b1, _ = b.bbox
    return min(a1, b1) - max(a0, b0) > 1.0


_LIST_START = re.compile(r"^[\u2022\u2023\u25cf\u25aa\u25e6*\-]\s|^\d+[.)]\s|^[a-zA-Z][.)]\s")


def _line_pitch(lines: list[Line]) -> float:
    """典型行距中位数：全部行按 y 排序后相邻起点差（跨列同行由 >0.5 过滤消除）。"""
    ys = sorted(l.bbox[1] for l in lines)
    gaps = [b - a for a, b in zip(ys, ys[1:]) if b - a > 0.5]
    if not gaps:
        return 14.0
    gaps.sort()
    return gaps[len(gaps) // 2]


def _same_style(a: Line, b: Line) -> bool:
    sa, sb = a.spans[0], b.spans[0]
    return abs(sa.size - sb.size) < 1.0 and sa.font == sb.font


def _paragraph_segments(assignment: ColumnAssignment) -> list[list[Line]]:
    """聚类分段：全宽段（按 y）+ 各列（每列一段），段边界是无条件分段点。"""
    segments: list[list[Line]] = []
    if assignment.full_width:
        segments.append(sorted(assignment.full_width, key=lambda l: l.bbox[1]))
    segments.extend(assignment.columns)
    return segments


def cluster_paragraphs(lines: list[Line], page_width: float, page_height: float) -> list[Paragraph]:
    """列检测 + 行合并 → 段落列表（阅读顺序）。page_height 预留 Task 9 分类使用。"""
    assignment = assign_columns(lines, page_width)
    pitch = _line_pitch(assignment.ordered)
    paragraphs: list[Paragraph] = []
    current: list[Line] = []

    def flush() -> None:
        if not current:
            return
        first = current[0]
        bbox = (
            min(l.bbox[0] for l in current),
            min(l.bbox[1] for l in current),
            max(l.bbox[2] for l in current),
            max(l.bbox[3] for l in current),
        )
        paragraphs.append(
            Paragraph(
                id=len(paragraphs),
                bbox=bbox,
                first_line_anchor=(first.origin[0], first.origin[1]),
                lines=list(current),
                reading_order=len(paragraphs),
            )
        )
        current.clear()

    for segment in _paragraph_segments(assignment):
        for line in segment:
            if not current:
                current.append(line)
                continue
            prev = current[-1]
            gap = line.bbox[1] - prev.bbox[3]
            # 断开条件：列表项起始 / 间隙过大 / 首行缩进（挂起缩进续行除外）/ 样式跳变。
            # 挂起缩进（bullet 行 + 缩进续行）不能按缩进拆断，否则续行会误并入下一项。
            bullet_start = bool(_LIST_START.match(line.text.strip()))
            indent = line.bbox[0] - prev.bbox[0] > 12.0
            bullet_continuation = bool(_LIST_START.match(prev.text.strip()))
            if bullet_start or gap > pitch * 0.6 or (indent and not bullet_continuation) or not _same_style(prev, line):
                flush()
            current.append(line)
        flush()  # 段边界（全宽段/列边界）无条件分段——列缝处 y 间隙可能为负，
        # 仅靠 gap 阈值会跨列合并，必须显式分段
    flush()

    # 全宽元素（标题）在阅读顺序头部；分类由 Task 9 的 classify_paragraph 负责
    return paragraphs


# 等宽字体名回退（span.mono 标志来自 PyMuPDF flags 2^3，优先；此处兜底子集字体名）。
# 勿用裸 `source|code|typewriter`：SourceHanSans/SourceSans/SourceSerif/AmericanTypewriter
# 等比例字体会被误判为等宽，导致整页代码跳过翻译。
_MONO_FONT_RE = re.compile(
    r"(?i)mono|courier|consolas|menlo|monaco|lucidaconsole|inconsolata|sourcecodepro"
)


def _is_monospace(para: Paragraph) -> bool:
    """主导样式判定：首行首 span 等宽（span.mono 或字体名）即视为代码段。
    仅查首 span：正文中内联代码 span 不应把整个段落判为代码。"""
    first_span = para.lines[0].spans[0]
    return first_span.mono or _MONO_FONT_RE.search(first_span.font) is not None


def _body_size(para: Paragraph) -> float:
    return max(s.size for l in para.lines for s in l.spans)


def classify_paragraph(para: Paragraph, body_size: float | None = None) -> None:
    """就地标注段落类型。body_size 传页内正文字号基准以判标题；缺省时用段落自身字号。"""
    if _is_monospace(para):
        para.type = "code"
        return
    first = para.lines[0].text.strip()
    if _LIST_START.match(first):  # _LIST_START 定义于 Task 8（聚类列表项规则复用）
        para.type = "list-item"
        return
    if body_size is not None and _body_size(para) >= body_size * 1.4:
        para.type = "heading"
        return
    para.type = "body"


def _overlap_ratio(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    area_a = max(1.0, (a[2] - a[0]) * (a[3] - a[1]))
    area_b = max(1.0, (b[2] - b[0]) * (b[3] - b[1]))
    return inter / min(area_a, area_b)


def page_confidence(paragraphs: list[Paragraph]) -> float:
    """置信度 = 1 - 重叠惩罚。阈值 0.6 以下触发降级。

    只基于重叠：单行段落惩罚会误伤混合页面（标题+列表+正文段等合法单行内容，
    使正确聚类的多行段落被降级拆散）；全单行页面的降级是恒等变换（无意义），
    因此单行占比不构成低置信度信号。
    """
    overlap_penalty = 0.0
    boxes = [p.bbox for p in paragraphs]
    pairs = 0
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            r = _overlap_ratio(boxes[i], boxes[j])
            if r > 0.3:
                overlap_penalty += r
                pairs += 1
    if pairs:
        overlap_penalty = min(0.5, overlap_penalty / pairs)
    return max(0.0, 1.0 - overlap_penalty)


def apply_fallback(paragraphs: list[Paragraph]) -> list[Paragraph]:
    """保守降级：每个 line 独立成段。宁可多拆不合并（错并会毁版面，多拆只多 API 调用）。"""
    result: list[Paragraph] = []
    for para in paragraphs:
        for line in para.lines:
            result.append(
                Paragraph(
                    id=len(result),
                    bbox=line.bbox,
                    first_line_anchor=line.origin,
                    lines=[line],
                    type=para.type,
                    reading_order=len(result),
                    confidence=0.5,
                )
            )
    return result
