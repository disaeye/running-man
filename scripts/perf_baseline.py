"""性能基线：API 端点耗时 + 页面 TTFB。输出 JSON 到 stdout。"""
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
AUTH = REPO / "apps/web/e2e/.auth/storageState.json"


def auth_cookie():
    state = json.loads(AUTH.read_text())
    for entry in state.get("cookies", []):
        if entry["name"] == "access_token":
            return f"access_token={entry['value']}"
    raise SystemExit("storageState.json 里没有 access_token")


def time_curl(url, cookie, repeat=8):
    times = []
    size = 0
    status = 0
    for _ in range(repeat):
        proc = subprocess.run(
            [
                "curl", "-s", "-o", "/dev/null", "-w",
                "%{time_starttransfer} %{time_total} %{size_download} %{http_code}",
                "-H", f"Cookie: {cookie}", url,
            ],
            capture_output=True, text=True, check=True,
        )
        ttfb, total, size, status = proc.stdout.split()
        times.append(float(total))
        time.sleep(0.05)
    times.sort()
    return {
        "status": int(status),
        "bytes": int(size),
        "p50_ms": round(times[len(times) // 2] * 1000, 1),
        "max_ms": round(times[-1] * 1000, 1),
    }


def percentile(values, ratio):
    values = sorted(values)
    return values[min(len(values) - 1, int(len(values) * ratio))]


def main():
    cookie = auth_cookie()
    today = time.strftime("%Y-%m-%d")
    week_ago = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 7 * 86400))
    month_ago = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 30 * 86400))

    endpoints = {
        "athletes/me": "http://127.0.0.1:31001/api/v1/athletes/me",
        "coach-context": f"http://127.0.0.1:31001/api/v1/insights/coach-context?date={today}",
        "readiness": f"http://127.0.0.1:31001/api/v1/insights/readiness?date={today}",
        "recommendation": f"http://127.0.0.1:31001/api/v1/insights/recommendation?date={today}",
        "activities-week": f"http://127.0.0.1:31001/api/v1/activities?from={week_ago}&to={today}&limit=50",
        "activities-30d": f"http://127.0.0.1:31001/api/v1/activities?from={month_ago}&to={today}&limit=50",
        "calendar": f"http://127.0.0.1:31001/api/v1/calendar?from={week_ago}&to={today}",
        "weekly-progress": f"http://127.0.0.1:31001/api/v1/insights/weekly-progress?from={month_ago}&to={today}",
        "pmc-30d": f"http://127.0.0.1:31001/api/v1/pmc?from={month_ago}&to={today}",
        "wellness-today": f"http://127.0.0.1:31001/api/v1/wellness?from={today}&to={today}",
        "integrations": "http://127.0.0.1:31001/api/v1/integrations",
        "integration-detail": "http://127.0.0.1:31001/api/v1/integrations/intervals_icu",
        "goals": "http://127.0.0.1:31001/api/v1/goals",
        "gear-shoes": "http://127.0.0.1:31001/api/v1/gear/shoes",
        "profile": "http://127.0.0.1:31001/api/v1/athletes/me/profile",
        "thresholds": "http://127.0.0.1:31001/api/v1/athletes/me/thresholds",
        "intensity-dist": f"http://127.0.0.1:31001/api/v1/insights/intensity-distribution?from={month_ago}&to={today}",
        "ability": f"http://127.0.0.1:31001/api/v1/insights/ability?from={month_ago}&to={today}",
        "personal-records": "http://127.0.0.1:31001/api/v1/insights/personal-records",
        "strength-workouts": f"http://127.0.0.1:31001/api/v1/strength/workouts?from={month_ago}&to={today}",
        "metrics-series-weight": f"http://127.0.0.1:31001/api/v1/metrics/series?metric=weight&from={month_ago}&to={today}",
    }

    results = {}
    for name, url in endpoints.items():
        try:
            results[name] = time_curl(url, cookie)
        except Exception as exc:  # noqa: BLE001 — 基线脚本要继续跑完
            results[name] = {"error": str(exc)}
        print(f"{name}: {results[name]}", file=sys.stderr)

    pages = {
        "home": "http://127.0.0.1:31000/",
        "calendar": "http://127.0.0.1:31000/calendar",
        "analysis": "http://127.0.0.1:31000/analysis",
        "goals": "http://127.0.0.1:31000/goals",
        "settings": "http://127.0.0.1:31000/settings",
        "activities": "http://127.0.0.1:31000/activities",
    }
    page_results = {}
    for name, url in pages.items():
        page_results[name] = time_curl(url, cookie, repeat=5)
        print(f"page {name}: {page_results[name]}", file=sys.stderr)

    print(json.dumps({"api": results, "pages": page_results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
