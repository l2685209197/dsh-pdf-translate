"""worker 入口：stdio 逐行 JSON 协议分发。

启动方式必须是 `python -m worker.main`（cwd = 仓库根），以支持 `from worker import ...`。
"""
from __future__ import annotations

import json
import sys
from typing import Any, Callable

from worker import extract, rebuild

HANDLERS: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    "textlayer": extract.text_layer_info,
    "extract": extract.extract_pages,
    "rebuild": rebuild.rebuild_document,
}


def main() -> None:
    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            req_id = msg.get("id")
            cmd = msg.get("cmd")
            payload = msg.get("payload") or {}
            handler = HANDLERS.get(cmd)
            if handler is None:
                resp = {"id": req_id, "ok": False, "error": f"unknown command: {cmd}"}
            else:
                try:
                    result = handler(payload)
                    resp = {"id": req_id, "ok": True, "result": result}
                except Exception as exc:  # noqa: BLE001 - 边界错误必须回传
                    resp = {"id": req_id, "ok": False, "error": f"{type(exc).__name__}: {exc}"}
            # 序列化也纳入边界处理：handler 返回不可序列化对象时不能裸崩溃
            # （否则上层 PdfWorker 因无响应而永久挂起），由外层 except 兜底为错误响应。
            line_out = json.dumps(resp)
            print(line_out, flush=True)
        except Exception as exc:  # noqa: BLE001
            resp = {"id": None, "ok": False, "error": f"protocol error: {exc}"}
            print(json.dumps(resp), flush=True)


if __name__ == "__main__":
    main()
