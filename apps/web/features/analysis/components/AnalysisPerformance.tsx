"use client";

import { PageCard } from "@shared/ui/Lovable";
import { LovableChart } from "@shared/ui/LovableChart";
import { useProfile } from "@features/settings/hooks/useProfile";
import { useAbility, formatPace } from "@features/today/hooks/useAbility";
import { useThresholdHistory } from "@features/settings/hooks/useThresholdHistory";

export function AnalysisPerformance() {
  const { profile } = useProfile();
  const { data: ability } = useAbility();
  const { entries } = useThresholdHistory();
  const metrics = [
    { label: "最大摄氧量", value: ability?.vdot?.toFixed(1) ?? "未记录", unit: "VO₂max", source: "估算" },
    { label: "乳酸阈心率 LTHR", value: profile?.lthr ?? "未记录", unit: "bpm", source: "估算" },
    { label: "阈值配速", value: formatPace(profile?.threshold_pace), unit: "/km", source: "估算" },
    { label: "最大心率 HRmax", value: profile?.hr_max ?? "未记录", unit: "bpm", source: "设置" },
  ];
  const paces = entries.filter((entry) => entry.threshold_pace != null);
  return <>
    <div className="grid grid-cols-2 gap-3">{metrics.map((metric) => <div key={metric.label} className="surface p-3"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{metric.label}</span><span>{metric.source}</span></div><div className="num mt-1 text-3xl font-bold">{metric.value}<span className="ml-1 text-xs font-normal text-muted-foreground">{metric.unit}</span></div></div>)}</div>
    <PageCard title="阈值配速趋势"><LovableChart h={120} lines={[{ data: paces.map((entry) => -(entry.threshold_pace ?? 0)), cls: "stroke-primary" }]} /><div className="mt-3 space-y-2">{paces.slice(-3).reverse().map((entry) => <div key={entry.effective_from} className="flex justify-between rounded-lg bg-secondary p-2.5 text-sm"><span>{entry.effective_from}</span><span className="num">{formatPace(entry.threshold_pace)} /km</span></div>)}</div></PageCard>
    <PageCard title="效率系数 EF"><p className="text-sm text-muted-foreground">活动效率系数由跑步速度与心率计算；当前页面按单次活动提供。</p></PageCard>
  </>;
}
