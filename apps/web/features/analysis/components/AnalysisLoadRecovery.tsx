"use client";

import { PageCard, Tag } from "@shared/ui/Lovable";
import { LovableChart, LovableLegend } from "@shared/ui/LovableChart";
import { usePmcData } from "@features/pmc/hooks/usePmcData";
import { useIntensityDistribution } from "@features/performance/hooks/useIntensityDistribution";
import { useWellness } from "@features/health/hooks/useWellness";
import { useZoneOverrides } from "@features/settings/hooks/useZoneOverrides";

export function AnalysisLoadRecovery({ from, to }: { from: string; to: string }) {
  const pmc = usePmcData(from, to);
  const wellness = useWellness(from, to);
  const intensity = useIntensityDistribution(from, to);
  const zonesConfig = useZoneOverrides();
  const zones = aggregateZones(intensity.data);
  const hrZones = zonesConfig.zones?.hr_zones ?? [];
  const lowIntensity = zones.slice(0, 2).reduce((sum, value) => sum + value, 0);
  const pmcLabels = pmc.data.map((point) => point.day.slice(5));
  return <div className="space-y-4" data-testid="analysis-load">
    <PageCard title="训练负荷 PMC"><LovableChart h={170} zero labels={pmcLabels} bars={{ data: pmc.data.map((point) => point.tss), cls: "fill-muted-foreground/25", label: "TSS", format: (v) => v.toFixed(0) }} lines={[{ data: pmc.data.map((point) => point.ctl), cls: "stroke-fitness", label: "CTL", format: (v) => v.toFixed(1) }, { data: pmc.data.map((point) => point.atl), cls: "stroke-fatigue", label: "ATL", format: (v) => v.toFixed(1) }, { data: pmc.data.map((point) => point.tsb), cls: "stroke-form", dashed: true, label: "TSB", format: (v) => v.toFixed(1) }]} /><LovableLegend items={[{ label: "CTL 体能", cls: "bg-fitness" }, { label: "ATL 疲劳", cls: "bg-fatigue" }, { label: "TSB 状态", cls: "bg-form" }, { label: "每日 TSS", cls: "bg-muted-foreground/40" }]} /></PageCard>
    <PageCard title="ACWR 负荷变化比" action={<Tag>急性7天 / 慢性28天 EWMA</Tag>}><LovableChart h={90} labels={pmcLabels} lines={[{ data: pmc.data.map((point) => point.acwr ?? null), cls: "stroke-warn", label: "ACWR", format: (v) => v.toFixed(2) }]} /><p className="mt-1 text-caption1 text-muted-foreground">仅作负荷变化参考，不作伤病风险判断</p></PageCard>
    <PageCard title="强度分布 · 心率区间" action={<Tag>按活动发生时阈值</Tag>}>
      <div className="flex h-3 overflow-hidden rounded-full">{zones.map((zone, index) => <div key={index} style={{ width: `${zone}%` }} className={`bg-z${index + 1}`} />)}</div>
      <div className="mt-3 grid grid-cols-5 text-center">{zones.map((zone, index) => <div key={index}><div className="num text-lg font-semibold">{zone}%</div><div className="text-caption1 leading-tight text-muted-foreground">Z{index + 1}<br />{zoneRangeLabel(hrZones[index])}</div></div>)}</div>
      <p className="mt-3 rounded-lg bg-secondary p-2 text-xs">低强度占比 {lowIntensity}%，{lowIntensityNote(lowIntensity)}</p>
      <p className="mt-2 text-caption1 text-muted-foreground">{zonesConfig.zones?.hr_scheme_label ?? "心率区间"} · 按活动时间使用当时的阈值计算</p>
    </PageCard>
    <PageCard title="负荷 × 恢复对照（近 28 天）"><RecoveryCharts wellness={wellness.data.slice(-28)} tss={pmc.data.slice(-28)} /></PageCard>
  </div>;
}

function zoneRangeLabel(zone: { min_value: number; max_value: number | null } | undefined): string {
  if (!zone) return "--";
  return zone.max_value == null ? `${zone.min_value}+` : `${zone.min_value}–${zone.max_value}`;
}

function lowIntensityNote(lowIntensity: number): string {
  if (lowIntensity >= 80) return "接近 80/20 结构；Z3 略高，留意轻松跑是否够轻松。";
  if (lowIntensity >= 60) return "低于 80/20 结构；轻松跑占比可以再提高一些。";
  return "明显低于 80/20 结构；高强度比例偏高，注意恢复安排。";
}

function aggregateZones(data: { zoneSeconds: number[] }[]): number[] {
  const seconds = Array.from({ length: 5 }, (_, index) => data.reduce((sum, point) => sum + (point.zoneSeconds[index] ?? 0), 0));
  const total = seconds.reduce((sum, value) => sum + value, 0);
  return seconds.map((value) => total > 0 ? Math.round(value / total * 100) : 0);
}

function RecoveryCharts({ wellness, tss }: { wellness: ReturnType<typeof useWellness>["data"]; tss: ReturnType<typeof usePmcData>["data"] }) {
  const loads = new Map(tss.map((point) => [point.day, point.tss]));
  const labels = wellness.map((point) => point.day.slice(5));
  const rows = [
    // 每日 TSS 缺记录就是零负荷（休息日），保留 0；
    // 生理指标没测到就是未记录，画 0 会把未测当成测了零，全部断线。
    { label: "每日 TSS", data: wellness.map((point) => loads.get(point.day) ?? 0), cls: "stroke-primary", format: (v: number) => v.toFixed(0) },
    { label: "HRV ms", data: wellness.map((point) => point.hrv ?? null), cls: "stroke-form", format: (v: number) => v.toFixed(0) },
    { label: "静息心率 bpm", data: wellness.map((point) => point.resting_hr ?? null), cls: "stroke-fatigue", format: (v: number) => v.toFixed(0) },
    { label: "睡眠 h", data: wellness.map((point) => point.sleep_secs != null ? point.sleep_secs / 3600 : null), cls: "stroke-fitness", format: (v: number) => v.toFixed(1) },
  ];
  return <div>{rows.map((row) => <div key={row.label} className="border-b py-2 last:border-0"><div className="text-caption1 text-muted-foreground">{row.label}</div><LovableChart h={40} labels={labels} lines={[{ data: row.data, cls: row.cls, label: row.label.split(" ")[0], format: row.format }]} /></div>)}</div>;
}
