"use client";

import { useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import "@shared/lib/echarts-setup";
import { useChartConfig, type ChartConfig } from "@shared/hooks/useChartConfig";
import { useECharts } from "@shared/hooks/useECharts";
import { Card } from "@shared/ui/Card";
import { SectionHeader } from "@shared/ui/SectionHeader";
import { EmptyState } from "@shared/ui/EmptyState";
import { usePmcData } from "@features/pmc/hooks/usePmcData";
import { useStrengthAnalytics } from "@features/strength/hooks/useStrengthAnalytics";
import { useReadiness } from "@features/today/hooks/useReadiness";
import { useActivities } from "@features/activity/hooks/useActivities";
import { computeRange } from "@shared/lib/format";
import { getAnalysisSportFamily, type AnalysisSportFamily } from "@features/analysis/lib/analysis-metric-taxonomy";

type RadarDim = {
  readonly key: keyof AbilityScores;
  readonly label: string;
  readonly axisLabel: string;
  readonly scale: string;
};

const RUNNING_RADAR_DIMS = [
  { key: "endurance", label: "耐力", axisLabel: "耐力 (CTL)", scale: "0=CTL 0 · 50=CTL 25 · 100=CTL 50+" },
  { key: "speed", label: "速度", axisLabel: "速度 (5K配速)", scale: "0=7:00/km · 50=5:15/km · 100=3:30/km" },
  { key: "strength", label: "力量", axisLabel: "力量 (e1RM)", scale: "0=无记录 · 50≈6项 · 100≈13项" },
  { key: "recovery", label: "恢复", axisLabel: "恢复 (Readiness)", scale: "0=恢复不足 · 50=中性 · 100=状态充足" },
  { key: "consistency", label: "一致性", axisLabel: "一致性 (30日)", scale: "0=0天 · 50=15天 · 100=30天" },
] as const satisfies readonly RadarDim[];

const CYCLING_RADAR_DIMS = [
  { key: "endurance", label: "耐力", axisLabel: "耐力 (CTL)", scale: "0=CTL 0 · 50=CTL 25 · 100=CTL 50+" },
  { key: "speed", label: "功率", axisLabel: "功率 (FTP)", scale: "0=无功率 · 50=稳定功率输出 · 100=高质量功率曲线" },
  { key: "strength", label: "力量", axisLabel: "力量 (e1RM)", scale: "0=无记录 · 50≈6项 · 100≈13项" },
  { key: "recovery", label: "恢复", axisLabel: "恢复 (Readiness)", scale: "0=恢复不足 · 50=中性 · 100=状态充足" },
  { key: "consistency", label: "一致性", axisLabel: "一致性 (30日)", scale: "0=0天 · 50=15天 · 100=30天" },
] as const satisfies readonly RadarDim[];

export interface AbilityScores {
  endurance: number;
  speed: number;
  strength: number;
  recovery: number;
  consistency: number;
}

/**
 * 5-axis ability radar (endurance / speed / strength / recovery / consistency).
 * Scores are derived client-side from existing hooks — no new API calls.
 * 耐力 from CTL · 速度 from best 5km-equivalent run pace · 力量 from strength e1RM count ·
 * 恢复 from readiness · 一致性 from distinct training days in the last 30 days.
 */
type AbilityRadarProps = {
  readonly sport?: string | null;
  readonly dateRange?: { readonly from: string; readonly to: string };
};

export function AbilityRadar({
  sport = null,
  dateRange,
}: AbilityRadarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartConfig = useChartConfig();
  const yearAgo = useMemo(
    () => dateRange ?? computeRange(365),
    [dateRange],
  );
  const sportFamily = getAnalysisSportFamily(sport);
  const radarDims = radarDimsForSport(sportFamily);

  const { data: pmc } = usePmcData(yearAgo.from, yearAgo.to);
  const { data: runs } = useActivities(yearAgo.from, yearAgo.to);
  const { e1rm } = useStrengthAnalytics(yearAgo);
  const { data: readiness } = useReadiness();

  const scores = useMemo<AbilityScores>(() => {
    const ctl = pmc.length > 0 ? pmc[pmc.length - 1]?.ctl ?? 0 : 0;
    const endurance = Math.min(100, Math.max(0, (ctl / 50) * 100));
    const speed = deriveSpeedScore(runs);
    const strength = e1rm.length > 0 ? Math.min(100, e1rm.length * 8) : 0;
    const recovery = readiness?.local_readiness?.score ?? 0;
    const trainingDays = new Set(runs.map((a) => a.start_time.slice(0, 10)));
    const consistency = Math.min(100, (trainingDays.size / 30) * 100);
    return { endurance, speed, strength, recovery, consistency };
  }, [pmc, runs, e1rm, readiness]);

  const hasAnySignal =
    scores.endurance > 0 ||
    scores.speed > 0 ||
    scores.strength > 0 ||
    scores.recovery > 0 ||
    scores.consistency > 0;

  useECharts(
    containerRef,
    () => buildRadarOption(radarDims.map((d) => d.axisLabel), radarDims.map((d) => scores[d.key]), chartConfig),
    [scores.endurance, scores.speed, scores.strength, scores.recovery, scores.consistency, chartConfig],
    { chartConfig },
  );

  return (
    <Card padding="md" className="min-h-[320px]" data-testid="ability-radar-card">
      <SectionHeader title="能力雷达" subtitle="耐力 · 速度 · 力量 · 恢复 · 一致性" />
      {hasAnySignal ? (
        <div ref={containerRef} className="mt-3 h-[320px] w-full" data-testid="ability-radar" />
      ) : (
        <div className="mt-3 flex h-[280px] items-center justify-center">
          <EmptyState
            title="暂无能力数据"
            description="导入活动、连接可穿戴设备、记录训练后，雷达图将自动生成"
          />
        </div>
      )}
      <ul className="mt-2 grid grid-cols-5 gap-2 text-center text-caption2 text-text-muted">
        {radarDims.map((d) => (
          <li
            key={d.key}
            className="flex flex-col rounded-lg bg-surface-overlay/55 px-1 py-2"
          >
            <span className="font-mono text-subheadline font-semibold tabular-nums text-text-primary">
              {Math.round(scores[d.key])}
            </span>
            <span>{d.label}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-border-subtle pt-3 text-caption2 text-text-muted">
        <p className="font-medium text-text-secondary">
          刻度说明：0 / 50 / 100 分别代表低基线、中等参考、优秀参考。
        </p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {radarDims.map((d) => (
            <li key={d.key}>
              {d.axisLabel}: {d.scale}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function radarDimsForSport(sportFamily: AnalysisSportFamily): readonly RadarDim[] {
  return sportFamily === "cycling" ? CYCLING_RADAR_DIMS : RUNNING_RADAR_DIMS;
}

/** Score: 100 at ≤3:30/km, 0 at ≥7:00/km, linear in between. */
function deriveSpeedScore(
  runs: ReturnType<typeof useActivities>["data"],
): number {
  let bestPaceSecPerKm: number | null = null;
  for (const run of runs) {
    if (run.sport !== "Run" || run.distance_m == null || run.duration_s == null) continue;
    if (run.distance_m < 5000) continue;
    const secPerKm = run.duration_s / (run.distance_m / 1000);
    if (bestPaceSecPerKm == null || secPerKm < bestPaceSecPerKm) {
      bestPaceSecPerKm = secPerKm;
    }
  }
  if (bestPaceSecPerKm == null) return 0;
  const FAST = 210;
  const SLOW = 420;
  if (bestPaceSecPerKm <= FAST) return 100;
  if (bestPaceSecPerKm >= SLOW) return 0;
  return Math.round(100 - ((bestPaceSecPerKm - FAST) / (SLOW - FAST)) * 100);
}

function buildRadarOption(labels: string[], values: number[], chartConfig: ChartConfig): echarts.EChartsCoreOption {
  const c = chartConfig.colors;
  return {
    radar: {
      indicator: labels.map((name) => ({ name, max: 100 })),
      shape: "polygon",
      splitNumber: 4,
      axisName: { color: c.textSecondary, fontSize: 11 },
      splitLine: { lineStyle: { color: c.borderSubtle } },
      splitArea: { areaStyle: { color: [c.surfaceBase, c.surfaceOverlay] } },
      axisLine: { lineStyle: { color: c.borderSubtle } },
    },
    series: [
      {
        type: "radar",
        data: [
          {
            value: values,
            name: "能力",
            symbol: "circle",
            symbolSize: 5,
            lineStyle: { width: 2, color: c.accent },
            itemStyle: { color: c.accent },
            areaStyle: { color: c.surfaceOverlay, opacity: 0.35 },
          },
        ],
      },
    ],
  };
}
