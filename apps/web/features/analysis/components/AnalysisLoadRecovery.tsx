"use client";

import { useMemo } from "react";
import { PageCard, Tag } from "@shared/ui/Lovable";
import { LovableChart, LovableLegend } from "@shared/ui/LovableChart";
import { usePmcData } from "@features/pmc/hooks/usePmcData";
import { useIntensityDistribution } from "@features/performance/hooks/useIntensityDistribution";
import { useWellness } from "@features/health/hooks/useWellness";
import { athleteRange, useAthleteTimezone } from "@shared/lib/training-day";

export function AnalysisLoadRecovery({ days }: { days: number }) {
  const timezone = useAthleteTimezone();
  const range = useMemo(() => athleteRange(days, timezone), [days, timezone]);
  const pmc = usePmcData(range.from, range.to);
  const wellness = useWellness(range.from, range.to);
  const intensity = useIntensityDistribution(range.from, range.to);
  const zones = aggregateZones(intensity.data);
  return <>
    <PageCard title="训练负荷 PMC"><LovableChart h={170} zero bars={{ data: pmc.data.map((point) => point.tss), cls: "fill-muted-foreground/25" }} lines={[{ data: pmc.data.map((point) => point.ctl), cls: "stroke-fitness" }, { data: pmc.data.map((point) => point.atl), cls: "stroke-fatigue" }, { data: pmc.data.map((point) => point.tsb), cls: "stroke-form", dashed: true }]} /><LovableLegend items={[{ label: "CTL 体能", cls: "bg-fitness" }, { label: "ATL 疲劳", cls: "bg-fatigue" }, { label: "TSB 状态", cls: "bg-form" }, { label: "每日 TSS", cls: "bg-muted-foreground/40" }]} /></PageCard>
    <PageCard title="ACWR 负荷变化比" action={<Tag>急性7天 / 慢性28天 EWMA</Tag>}><LovableChart h={90} lines={[{ data: pmc.data.map((point) => point.acwr ?? 0), cls: "stroke-warn" }]} /><p className="mt-1 text-caption1 text-muted-foreground">仅作负荷变化参考，不作伤病风险判断</p></PageCard>
    <PageCard title="强度分布 · 心率区间"><div className="flex h-3 overflow-hidden rounded-full">{zones.map((zone, index) => <div key={index} style={{ width: `${zone}%` }} className={`bg-z${index + 1}`} />)}</div><div className="mt-3 grid grid-cols-5 text-center">{zones.map((zone, index) => <div key={index}><div className="num text-lg font-semibold">{zone}%</div><div className="text-caption1 text-muted-foreground">Z{index + 1}</div></div>)}</div></PageCard>
    <PageCard title={`负荷 × 恢复对照（近 ${Math.min(days, 28)} 天）`}><RecoveryCharts wellness={wellness.data.slice(-28)} /></PageCard>
  </>;
}

function aggregateZones(data: { zoneSeconds: number[] }[]): number[] {
  const seconds = Array.from({ length: 5 }, (_, index) => data.reduce((sum, point) => sum + (point.zoneSeconds[index] ?? 0), 0));
  const total = seconds.reduce((sum, value) => sum + value, 0);
  return seconds.map((value) => total > 0 ? Math.round(value / total * 100) : 0);
}

function RecoveryCharts({ wellness }: { wellness: ReturnType<typeof useWellness>["data"] }) {
  const rows = [
    { label: "HRV ms", data: wellness.map((point) => point.hrv ?? 0), cls: "stroke-form" },
    { label: "静息心率 bpm", data: wellness.map((point) => point.resting_hr ?? 0), cls: "stroke-fatigue" },
    { label: "睡眠 h", data: wellness.map((point) => (point.sleep_secs ?? 0) / 3600), cls: "stroke-fitness" },
  ];
  return <div>{rows.map((row) => <div key={row.label} className="border-b py-2 last:border-0"><div className="text-caption1 text-muted-foreground">{row.label}</div><LovableChart h={40} lines={[{ data: row.data, cls: row.cls }]} /></div>)}</div>;
}
