"use client";

import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { useSyncDetail } from "@features/data/hooks/useSyncDetail";
import { useSyncHealth } from "@features/data/hooks/useSyncHealth";
import { useActivities } from "@features/activity/hooks/useActivities";
import { athleteRange, useAthleteTimezone } from "@shared/lib/training-day";
import { useMemo } from "react";

/**
 * 穿戴与数据源连接（参考稿的传感器卡）。
 *
 * 这一页能读到的设备信息只有一件：从活动记录里读出设备名（例如
 * "HUAWEI WATCH FIT 4"）。手表电量、在线状态、校准这类数据需要直连设备，
 * Intervals.icu 不提供，所以这里不写它们——写上去只能编一个数字。
 *
 * 数据源那一块是真的：连接状态、最近一次同步时间，以及立即同步按钮。
 */

const DEVICE_LOOKBACK_DAYS = 30;

interface Props {
  readonly testId?: string;
}

export function DemoDevicesCard({ testId }: Props) {
  const timezone = useAthleteTimezone();
  const range = useMemo(
    () => athleteRange(DEVICE_LOOKBACK_DAYS, timezone),
    [timezone],
  );
  const activities = useActivities(range.from, range.to);
  const detail = useSyncDetail("intervals_icu");
  const health = useSyncHealth();

  // 设备名按出现次数排：最近用得最多的那台就是主力设备。
  const devices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const activity of activities.data) {
      const name = activity.device_name?.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));
  }, [activities.data]);

  const lastSync = detail.data?.last_sync ?? null;

  return (
    <Card data-testid={testId ?? "demo-devices-card"}>
      <div className="flex items-center justify-between gap-3">
        <LabelCaps icon={<span>◈</span>}>DEVICES & SOURCES · 穿戴与数据源</LabelCaps>
        <span className="font-mono text-caption1 text-text-muted">
          {detail.data?.status === "connected" ? "已连接" : NO_VALUE}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {devices.length > 0 ? (
          devices.map((device) => (
            <div
              key={device.name}
              className="flex items-center justify-between gap-3 rounded-lg bg-surface-overlay px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-subheadline text-text-primary">
                  {device.name}
                </p>
                <p className="mt-0.5 text-caption1 text-text-muted">
                  近 {DEVICE_LOOKBACK_DAYS} 天 {device.count} 次记录来自这台设备
                </p>
              </div>
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full bg-accent"
              />
            </div>
          ))
        ) : (
          <p className="text-caption1 text-text-muted">
            最近的训练记录里没有设备名，同步之后这里会显示主力设备。
          </p>
        )}
      </div>

      <div className="mt-3 rounded-lg bg-surface-overlay px-3 py-2.5">
        <p className="text-caption1 font-medium text-text-secondary">
          Intervals.icu 数据源
        </p>
        <p className="mt-1 text-caption1 text-text-muted">
          {lastSync
            ? `最近一次同步 ${formatTimestamp(lastSync)}`
            : "还没有同步记录"}
          {health.label ? ` · ${health.label}` : ""}
        </p>
      </div>

      <p className="mt-3 text-caption1 text-text-muted">
        手表电量与在线状态需要直连设备，Intervals.icu 不提供这些数据。
      </p>
    </Card>
  );
}

/** 同步时间戳的可读写法。 */
function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
