"use client";

import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { useActivities } from "@features/activity/hooks/useActivities";
import { athleteRange, useAthleteTimezone } from "@shared/lib/training-day";
import { useMemo } from "react";

/**
 * 训练设备概况（参考稿的传感器卡）。
 *
 * 从活动记录里读取设备名称与使用次数。这里仅显示活动记录中实际存在的设备信息。
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

  return (
    <Card data-testid={testId ?? "demo-devices-card"}>
      <LabelCaps>训练设备</LabelCaps>

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
            最近 30 天的训练记录里没有设备名称。
          </p>
        )}
      </div>
    </Card>
  );
}
