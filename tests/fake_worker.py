import json
import sys

print(json.dumps({"ready": True}), flush=True)
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    msg = json.loads(line)
    if msg["cmd"] == "textlayer":
        result = {"pageCount": 3, "hasTextLayer": True, "pages": [{"index": i, "charCount": 10} for i in range(3)]}
        print(json.dumps({"id": msg["id"], "ok": True, "result": result}), flush=True)
    elif msg["cmd"] == "extract":
        print(json.dumps({"id": msg["id"], "ok": True, "result": {"pages": [{"index": 0, "paragraphs": []}]}}), flush=True)
    elif msg["cmd"] == "rebuild":
        print(json.dumps({"id": msg["id"], "ok": True, "result": {"warnings": []}}), flush=True)
    else:
        print(json.dumps({"id": msg["id"], "ok": False, "error": f"unknown: {msg['cmd']}"}), flush=True)
