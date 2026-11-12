from __future__ import annotations

import argparse
import json
import subprocess
import time
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="监控进程树峰值常驻内存")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--interval", type=float, default=0.2)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if args.command and args.command[0] == "--":
        args.command = args.command[1:]
    if not args.command:
        parser.error("a command is required after the monitor options")
    return args


def descendants(root: int) -> list[int]:
    pids = [root]
    for path in Path("/proc").iterdir():
        if not path.name.isdigit():
            continue
        try:
            status = (path / "status").read_text()
        except OSError:
            continue
        for line in status.splitlines():
            if line.startswith("PPid:"):
                if int(line.split()[1]) == root:
                    pids.extend(descendants(int(path.name)))
                break
    return pids


def rss_kb(pid: int) -> int:
    try:
        for line in Path(f"/proc/{pid}/status").read_text().splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1])
    except OSError:
        return 0
    return 0


def main() -> int:
    args = parse_args()
    started = time.monotonic()
    process = subprocess.Popen(args.command)
    peak_kb = 0
    samples = 0
    while process.poll() is None:
        total = sum(rss_kb(pid) for pid in descendants(process.pid))
        peak_kb = max(peak_kb, total)
        samples += 1
        time.sleep(args.interval)
    report = {
        "command": args.command,
        "exit_code": process.returncode,
        "peak_rss_kb": peak_kb,
        "samples": samples,
        "elapsed_s": round(time.monotonic() - started, 2),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False))
    return process.returncode or 0


if __name__ == "__main__":
    raise SystemExit(main())
