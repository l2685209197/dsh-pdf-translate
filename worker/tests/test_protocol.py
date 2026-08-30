import json
import subprocess
import sys

ROOT = __import__("pathlib").Path(__file__).resolve().parents[2]


def run_cmd(cmd: str, payload: dict) -> dict:
    proc = subprocess.Popen(
        [sys.executable, "-m", "worker.main"],
        cwd=str(ROOT),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )
    assert proc.stdin is not None and proc.stdout is not None
    ready = json.loads(proc.stdout.readline())
    assert ready == {"ready": True}
    proc.stdin.write(json.dumps({"id": 1, "cmd": cmd, "payload": payload}) + "\n")
    proc.stdin.flush()
    resp = json.loads(proc.stdout.readline())
    proc.stdin.close()
    proc.wait(timeout=10)
    return resp


def test_unknown_command_returns_error():
    resp = run_cmd("nope", {})
    assert resp["id"] == 1
    assert resp["ok"] is False
    assert "unknown" in resp["error"]
