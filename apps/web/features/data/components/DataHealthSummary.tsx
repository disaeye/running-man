"use client";

import { Stat } from "@shared/ui/Lovable";
import { useDataHealth } from "@features/data/hooks/useDataHealth";
import { formatRelativeTime } from "@shared/lib/format";

export function DataHealthSummary() {
  const { data: health, loading, error } = useDataHealth();
  if (loading) return <p className="text-sm text-muted-foreground">正在检查数据质量…</p>;
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  const activities = health?.activities;
  const gaps = health?.gaps ?? [];
  const hrPct = activities?.total ? Math.round((activities.with_hr / activities.total) * 100) : 0;
  const gpsPct = activities?.total ? Math.round((activities.with_gps / activities.total) * 100) : 0;
  const streamPct = activities?.total ? Math.round((activities.with_streams / activities.total) * 100) : 0;
  const latest = [activities?.data_as_of, health?.wellness.data_as_of].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  return <div><div className="grid grid-cols-3 gap-3"><Stat label="活动" value={activities?.total ?? 0} unit="条" sub={latest ? `更新于 ${formatRelativeTime(latest)}` : "暂无记录"} /><Stat label="心率 / GPS" value={`${hrPct}%`} sub={`GPS ${gpsPct}%`} /><Stat label="数据缺口" value={gaps.length} unit="个" sub={`流数据 ${streamPct}%`} /></div>{gaps.length ? <p className="mt-3 text-caption1 text-warn">{gaps.map((gap) => `${gap.from} 至 ${gap.to}`).join("；")}</p> : null}</div>;
}
