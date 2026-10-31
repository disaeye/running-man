"use client";

import { useMemo } from "react";
import { PageCard, Stat } from "@shared/ui/Lovable";
import { LovableChart } from "@shared/ui/LovableChart";
import { useWellness } from "@features/health/hooks/useWellness";
import { athleteRange, useAthleteTimezone } from "@shared/lib/training-day";

export function AnalysisBodyLife() {
  const timezone = useAthleteTimezone();
  const range = useMemo(() => athleteRange(90, timezone), [timezone]);
  const wellness = useWellness(range.from, range.to);
  const points = wellness.data.filter((point) => point.weight != null || point.sleep_secs != null || point.resting_hr != null);
  const weight = points.filter((point) => point.weight != null);
  const latest = weight.at(-1)?.weight ?? null;
  const previous = weight.at(-2)?.weight ?? null;
  const weightPoints = points.filter((point) => point.weight != null);
  const sleepPoints = points.filter((point) => point.sleep_secs != null);
  return <div className="space-y-4"><PageCard title="体重"><div className="flex items-end justify-between"><Stat label="最新记录" value={latest ?? "未记录"} unit={latest != null ? "kg" : undefined} sub={latest != null && previous != null ? `较前次 ${(latest - previous).toFixed(1)} kg` : undefined} /><span className="eyebrow">90 天</span></div><div className="mt-4"><LovableChart lines={[{ data: weightPoints.map((point) => point.weight ?? 0), cls: "stroke-warn" }]} h={150} /></div></PageCard><PageCard title="睡眠与恢复"><div className="mt-1"><LovableChart lines={[{ data: sleepPoints.map((point) => (point.sleep_secs ?? 0) / 3600), cls: "stroke-fitness" }]} h={150} /></div><p className="mt-3 text-xs text-muted-foreground">纵轴为小时，仅绘制有睡眠记录的日期；静息心率与 HRV 由健康数据源提供。</p></PageCard></div>;
}
