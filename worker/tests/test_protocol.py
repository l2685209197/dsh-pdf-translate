import json
import subprocess
import sys

ROOT = __import__("pathlib").Path(__file__).resolve().parents[2]


def run_cmd(cmd: str, payload: dict, raw_line: str | None = None) -> dict:
    proc = subprocess.Popen(
        [sys.executable, "-m", "worker.main"],
        cwd=str(ROOT),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )
    assert proc.stdin is not None and proc.stdout is not None
    try:
        ready = json.loads(proc.stdout.readline())
        assert ready == {"ready": True}
        if raw_line is not None:
            proc.stdin.write(raw_line + "\n")
        else:
            proc.stdin.write(json.dumps({"id": 1, "cmd": cmd, "payload": payload}) + "\n")
        proc.stdin.flush()
        resp = json.loads(proc.stdout.readline())
        return resp
    finally:
        proc.stdin.close()
        proc.kill()
        proc.wait(timeout=10)


def test_unknown_command_returns_error():
    resp = run_cmd("nope", {})
    assert resp["id"] == 1
    assert resp["ok"] is False
    assert "unknown" in resp["error"]


def test_handler_exception_is_wrapped():
    # Task 11 前 extract_pages 是 NotImplementedError 占位；实现后空 payload 缺 path → KeyError
    resp = run_cmd("extract", {})
    assert resp["id"] == 1
    assert resp["ok"] is False
    assert "KeyError" in resp["error"]


def test_malformed_line_returns_protocol_error():
    resp = run_cmd("", {}, raw_line="not json")
    assert resp["ok"] is False
    assert "protocol error" in resp["error"]
