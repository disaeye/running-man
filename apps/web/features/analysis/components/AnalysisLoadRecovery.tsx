"use client";

import { PageCard } from "@shared/ui/Card";
import { Tag } from "@shared/ui/Badge";
import { DisclosureCard } from "@shared/ui/DisclosureCard";
import { LovableChart, LovableLegend } from "@shared/ui/LovableChart";
import { ProportionBar } from "@shared/ui/ProportionBar";
import { MetricInlineDisclosure } from "@shared/ui/MetricInlineDisclosure";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { ZONE_TONE_CLASS, zoneFor } from "@shared/lib/metric-zone";
import { useActivities } from "@features/activity/hooks/useActivities";
import { buildPmcAnnotations } from "@features/analysis/lib/chart-annotations";
import { usePmcData } from "@features/pmc/hooks/usePmcData";
import { useIntensityDistribution } from "@features/performance/hooks/useIntensityDistribution";
import { useWellness } from "@features/health/hooks/useWellness";
import { useZoneOverrides } from "@features/settings/hooks/useZoneOverrides";
import { summarizeIntensity } from "@features/analysis/lib/intensity-summary";
import { WeeklyDistanceCard } from "./WeeklyDistanceCard";

const HR_ZONE_LABELS = ["恢复", "有氧", "节奏", "阈值", "无氧"] as const;

/**
 * 负荷与恢复分析（对标 COROS EvoLab / Garmin Training Status）：
 * 顶部 4 格状态读数带（CTL/ATL/TSB/ACWR，ACWR 只在这里出现）+ PMC 主图 + 心率五区分布。
 */
export function AnalysisLoadRecovery({ from, to }: { from: string; to: string }) {
  const pmc = usePmcData(from, to);
  const activities = useActivities(from, to);
  const wellness = useWellness(from, to);
  const intensity = useIntensityDistribution(from, to);
  const zonesConfig = useZoneOverrides();
  const { percentages: zones, lowPct, hasData: hasIntensity } = summarizeIntensity(intensity.data);
  const hrZones = zonesConfig.zones?.hr_zones ?? [];
  const lowIntensity = lowPct;
  const pmcLabels = pmc.data.map((point) => point.day.slice(5));
  const pmcAnnotations = buildPmcAnnotations(
    pmc.data.map((point) => point.day),
    activities.data,
  );
  const latestPmc = pmc.data.at(-1) ?? null;
  const tsbZone = zoneFor("tsb", latestPmc?.tsb);
  const acwrZone = zoneFor("acwr", latestPmc?.acwr);

  return (
    <div className="space-y-4" data-testid="analysis-load">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="surface p-3.5">
          <div className="flex items-center gap-1.5 text-caption1 text-text-muted">
            <span className="size-2 rounded-full bg-fitness" aria-hidden="true" />
            <span>CTL 体能</span>
            <MetricInlineDisclosure termKey="CTL" align="left" />
          </div>
          <div className="num mt-1 font-mono text-2xl font-bold tabular-nums text-text-primary">
            {latestPmc?.ctl != null ? latestPmc.ctl.toFixed(1) : NO_VALUE}
          </div>
          <p className="mt-0.5 text-caption1 text-text-muted">42 天慢性负荷</p>
        </div>

        <div className="surface p-3.5">
          <div className="flex items-center gap-1.5 text-caption1 text-text-muted">
            <span className="size-2 rounded-full bg-fatigue" aria-hidden="true" />
            <span>ATL 疲劳</span>
            <MetricInlineDisclosure termKey="ATL" align="right" />
          </div>
          <div className="num mt-1 font-mono text-2xl font-bold tabular-nums text-text-primary">
            {latestPmc?.atl != null ? latestPmc.atl.toFixed(1) : NO_VALUE}
          </div>
          <p className="mt-0.5 text-caption1 text-text-muted">7 天急性负荷</p>
        </div>

        <div className="surface p-3.5">
          <div className="flex items-center justify-between gap-1 text-caption1 text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-form" aria-hidden="true" />
              <span>TSB 状态</span>
              <MetricInlineDisclosure termKey="TSB" align="left" />
            </span>
            {tsbZone ? (
              <span className={`text-caption1 font-medium ${ZONE_TONE_CLASS[tsbZone.tone].text}`}>{tsbZone.shortLabel}</span>
            ) : null}
          </div>
          <div className="num mt-1 font-mono text-2xl font-bold tabular-nums text-text-primary">
            {latestPmc?.tsb != null ? `${latestPmc.tsb > 0 ? "+" : ""}${latestPmc.tsb.toFixed(1)}` : NO_VALUE}
          </div>
          <p className="mt-0.5 text-caption1 text-text-muted">体能 − 疲劳</p>
        </div>

        <div className="surface p-3.5">
          <div className="flex items-center justify-between gap-1 text-caption1 text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-warn" aria-hidden="true" />
              <span>ACWR</span>
              <MetricInlineDisclosure termKey="ACWR" align="right" />
            </span>
            {acwrZone ? (
              <span className={`text-caption1 font-medium ${ZONE_TONE_CLASS[acwrZone.tone].text}`}>{acwrZone.shortLabel}</span>
            ) : null}
          </div>
          <div className="num mt-1 font-mono text-2xl font-bold tabular-nums text-text-primary">
            {latestPmc?.acwr != null ? latestPmc.acwr.toFixed(2) : NO_VALUE}
          </div>
          <p className="mt-0.5 text-caption1 text-text-muted">参考走廊 0.8–1.3</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
        <div className="space-y-4 lg:col-span-7">
          <PageCard
            title="训练负荷 PMC"
          >
            {pmc.loading ? (
              <p className="py-8 text-caption1 text-text-muted" role="status">正在计算负荷曲线…</p>
            ) : pmc.error ? (
              <p className="py-8 text-caption1 text-error" role="alert">训练负荷加载失败：{pmc.error}</p>
            ) : (
              <LovableChart
                h={170}
                zero
                labels={pmcLabels}
                annotations={pmcAnnotations}
                bars={{ data: pmc.data.map((point) => point.tss), cls: "fill-text-muted/25", label: "TSS", format: (v) => v.toFixed(0) }}
                lines={[
                  { data: pmc.data.map((point) => point.ctl), cls: "stroke-fitness", label: "CTL", format: (v) => v.toFixed(1) },
                  { data: pmc.data.map((point) => point.atl), cls: "stroke-fatigue", dashed: true, label: "ATL", format: (v) => v.toFixed(1) },
                  { data: pmc.data.map((point) => point.tsb), cls: "stroke-form", dotted: true, label: "TSB", format: (v) => v.toFixed(1) },
                ]}
              />
            )}
            <LovableLegend items={[
              { label: "CTL 体能", cls: "bg-fitness" },
              { label: "ATL 疲劳", cls: "bg-fatigue", lineStyle: "dashed" },
              { label: "TSB 状态", cls: "bg-form", lineStyle: "dotted" },
              { label: "每日 TSS", cls: "bg-muted-foreground/40", kind: "bar" },
            ]} />
          </PageCard>

          <WeeklyDistanceCard from={from} to={to} />

          <DisclosureCard
            title="负荷 × 恢复对照"
            summary="对比所选周期内每日 TSS、HRV、静息心率与睡眠趋势"
          >
            {wellness.loading || pmc.loading ? (
              <p className="py-4 text-caption1 text-text-muted" role="status">正在加载负荷与恢复数据…</p>
            ) : wellness.error || pmc.error ? (
              <p className="py-4 text-caption1 text-error" role="alert">{wellness.error ?? pmc.error}</p>
            ) : (
              <RecoveryCharts wellness={wellness.data} tss={pmc.data} />
            )}
          </DisclosureCard>
        </div>

        <div className="space-y-4 lg:col-span-5">
          <PageCard title="强度分布 · 心率区间" action={<Tag>按活动发生时阈值</Tag>}>
            {intensity.loading ? (
              <p className="py-4 text-caption1 text-text-muted">正在读取心率区间分布…</p>
            ) : !hasIntensity ? (
              <p className="py-4 text-caption1 text-text-muted">所选时间范围内暂无包含心率流量的活动数据。</p>
            ) : (
              <>
                <ProportionBar
                  columns={5}
                  ariaLabel="心率五区强度分布"
                  segments={zones.map((zone, index) => ({
                    key: `Z${index + 1}`,
                    label: `Z${index + 1} ${HR_ZONE_LABELS[index] ?? ""}`,
                    pct: zone,
                    colorClass: `bg-z${index + 1}`,
                    subLabel: zoneRangeLabel(hrZones[index]),
                  }))}
                />
                <p className="mt-3 border-t border-border-subtle pt-3 text-caption1 text-text-secondary">
                  低强度占比 {lowIntensity}%，{lowIntensityNote(lowPct)}
                </p>
              </>
            )}
          </PageCard>
        </div>
      </div>
    </div>
  );
}

function zoneRangeLabel(zone: { min_value: number; max_value: number | null } | undefined): string {
  if (!zone) return NO_VALUE;
  return zone.max_value == null ? `${zone.min_value}+` : `${zone.min_value}–${zone.max_value}`;
}

function lowIntensityNote(lowPct: number): string {
  if (lowPct >= 80) return "符合 80/20 耐力训练结构。";
  if (lowPct >= 60) return "低于 80/20 结构；轻松跑占比可以再提高一些。";
  return "明显低于 80/20 结构；高强度比例偏高，注意恢复安排。";
}

function RecoveryCharts({ wellness, tss }: { wellness: ReturnType<typeof useWellness>["data"]; tss: ReturnType<typeof usePmcData>["data"] }) {
  const wellnessByDay = new Map(wellness.map((point) => [point.day, point]));
  const mergedDays = tss.length > 0 ? tss.map((p) => p.day) : wellness.map((p) => p.day);
  const tssByDay = new Map(tss.map((p) => [p.day, p.tss]));
  const labels = mergedDays.map((day) => day.slice(5));

  const rows = [
    { label: "每日 TSS", data: mergedDays.map((day) => tssByDay.get(day) ?? 0), cls: "stroke-text-secondary", zero: true, format: (v: number) => v.toFixed(0) },
    { label: "HRV ms", data: mergedDays.map((day) => wellnessByDay.get(day)?.hrv ?? null), cls: "stroke-form", zero: false, format: (v: number) => v.toFixed(0) },
    { label: "静息心率 bpm", data: mergedDays.map((day) => wellnessByDay.get(day)?.resting_hr ?? null), cls: "stroke-fatigue", zero: false, format: (v: number) => v.toFixed(0) },
    { label: "睡眠 h", data: mergedDays.map((day) => { const s = wellnessByDay.get(day)?.sleep_secs; return s != null ? s / 3600 : null; }), cls: "stroke-fitness", zero: false, format: (v: number) => v.toFixed(1) },
  ];
  return (
    <div>
      {rows.map((row) => (
        <div key={row.label} className="border-b border-border-subtle py-2 last:border-0">
          <div className="text-caption1 text-text-muted">{row.label}</div>
          <LovableChart
            h={44}
            zero={row.zero}
            labels={labels}
            lines={[{ data: row.data, cls: row.cls, label: row.label.split(" ")[0], format: row.format }]}
            emptyMessage={`暂无${row.label.split(" ")[0]}记录`}
          />
        </div>
      ))}
    </div>
  );
}
