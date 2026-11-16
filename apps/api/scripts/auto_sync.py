from __future__ import annotations

import asyncio
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

# 独立进程复用应用层：settings 从 apps/api/.env 读数据库与密钥，
# 因此本脚本必须以 apps/api 为工作目录运行（systemd 单元里已固定）。
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from application.integrations.scheduler import collect_targets
from application.integrations.sync_jobs import create_sync_job, run_sync_job
from application.notifications.scanner import scan_all_athletes
from infrastructure.db.pool import close_pool, get_pool, open_pool


async def main() -> int:
    await open_pool()
    try:
        targets, skipped = await collect_targets(datetime.now(UTC))
        synced = 0
        failures: list[str] = []
        for target in targets:
            job = await create_sync_job(
                target.athlete_id, target.source, "incremental", "schedule"
            )
            outcome = await run_sync_job(
                UUID(str(job["id"])),
                target.athlete_id,
                target.source,
                target.credentials,
            )
            if outcome.status == "success":
                synced += 1
            else:
                failures.append(
                    f"{target.source}:{outcome.status}:{outcome.error or '未知原因'}"
                )
        # 数据刚变过，顺手重评估通知规则；连接退出即提交。
        async with get_pool().connection() as conn:
            scan_report = await scan_all_athletes(conn)
        print(
            f"通知扫描：athletes={scan_report['athletes_scanned']} "
            f"generated={scan_report['notifications_generated']}"
        )
        print(
            f"自动同步：considered={len(targets) + len(skipped)} "
            f"due={len(targets)} synced={synced} failed={len(failures)}"
        )
        if skipped:
            print("跳过：" + ", ".join(skipped))
        for failure in failures:
            print("失败：" + failure)
        return 1 if failures else 0
    finally:
        await close_pool()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
