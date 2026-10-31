"use client";

import { useDataQuality } from "@features/data/hooks/useDataQuality";

export function DataHealthSummary() {
  const { data, loading, error } = useDataQuality();
  if (loading) return <p className="text-sm text-muted-foreground">正在检查数据…</p>;
  if (error || !data) return <p role="alert" className="text-sm text-destructive">{error ?? "数据质量暂不可用"}</p>;
  const activity = data.coverage.activities;
  const rows = [
    ["心率", activity.with_hr, activity.total_activities],
    ["GPS", activity.with_gps, activity.total_activities],
    ["运动流", activity.with_streams, activity.total_activities],
    ["睡眠 · 近 28 天", data.coverage.wellness.sleep_days_28d, 28],
    ["静息心率 · 近 28 天", data.coverage.wellness.rhr_days_28d, 28],
    ["HRV · 近 28 天", data.coverage.wellness.hrv_days_28d ?? 0, 28],
  ] as const;
  return <><p className="mb-3 text-caption1 text-muted-foreground">按 {activity.total_activities} 次活动及近 28 天健康数据统计</p><div className="divide-y">{rows.map(([label, count, total]) => <div key={label} className="flex justify-between py-2 text-xs"><span className="text-muted-foreground">{label}</span><span className={`num ${count < total * 0.8 ? "text-warn" : "text-form"}`}>{count} / {total}</span></div>)}</div>{data.issues.length ? <p className="mt-3 text-caption1 text-warn">{data.issues.length} 个问题需要处理，可在数据设置中查看。</p> : <p className="mt-3 text-caption1 text-form">当前检查未发现异常</p>}</>;
}
