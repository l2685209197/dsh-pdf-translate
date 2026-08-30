"""worker 与 TS 插件之间的协议数据模型。字段名是协议契约，勿改。"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Span:
    text: str
    bbox: tuple[float, float, float, float]  # x0, y0, x1, y1（页坐标，y 向下）
    font: str
    size: float
    color: str  # "#rrggbb"
    bold: bool
    italic: bool
    underline: bool
    origin: tuple[float, float]  # 首字符基线原点 [x, y]

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "bbox": list(self.bbox),
            "font": self.font,
            "size": round(self.size, 2),
            "color": self.color,
            "bold": self.bold,
            "italic": self.italic,
            "underline": self.underline,
            "origin": list(self.origin),
        }


@dataclass
class Line:
    text: str
    bbox: tuple[float, float, float, float]
    spans: list[Span] = field(default_factory=list)
    origin: tuple[float, float] = (0.0, 0.0)

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "bbox": list(self.bbox),
            "origin": list(self.origin),
            "spans": [s.to_dict() for s in self.spans],
        }


@dataclass
class Paragraph:
    id: int
    bbox: tuple[float, float, float, float]
    first_line_anchor: tuple[float, float]
    lines: list[Line] = field(default_factory=list)
    type: str = "body"  # body | heading | list-item | code | table-cell
    reading_order: int = 0
    confidence: float = 1.0
    table: dict[str, int] | None = None  # {"row": int, "col": int}

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "bbox": list(self.bbox),
            "firstLineAnchor": list(self.first_line_anchor),
            "lines": [l.to_dict() for l in self.lines],
            "type": self.type,
            "readingOrder": self.reading_order,
            "confidence": round(self.confidence, 3),
            "table": self.table,
        }
