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
  /** How the number is produced, in athlete-facing Chinese. */
  readonly basis: string;
};

const RUNNING_RADAR_DIMS = [
  {
    key: "endurance",
    label: "耐力",
    axisLabel: "耐力",
    basis: "由长期训练负荷 CTL 换算，CTL 50 计满分。",
  },
  {
    key: "speed",
    label: "速度",
    axisLabel: "速度",
    basis: "取 5 公里以上跑步活动的最好配速，3:30/km 计满分，7:00/km 计 0。",
  },
  {
    key: "strength",
    label: "力量",
    axisLabel: "力量",
    basis: "按已记录的力量动作数量换算，13 项计满分。",
  },
  {
    key: "recovery",
    label: "恢复",
    axisLabel: "恢复",
    basis: "取当日恢复评分；没有可用的睡眠、心率或负荷输入时不计分。",
  },
  {
    key: "consistency",
    label: "一致性",
    axisLabel: "一致性",
    basis: "按最近 30 天有训练的天数换算，30 天计满分。",
  },
] as const satisfies readonly RadarDim[];

const CYCLING_RADAR_DIMS = [
  {
    key: "endurance",
    label: "耐力",
    axisLabel: "耐力",
    basis: "由长期训练负荷 CTL 换算，CTL 50 计满分。",
  },
  {
    key: "speed",
    label: "功率",
    axisLabel: "功率",
    basis: "按功率曲线的代表性水平换算；没有功率计时不计分。",
  },
  {
    key: "strength",
    label: "力量",
    axisLabel: "力量",
    basis: "按已记录的力量动作数量换算，13 项计满分。",
  },
  {
    key: "recovery",
    label: "恢复",
    axisLabel: "恢复",
    basis: "取当日恢复评分；没有可用的睡眠、心率或负荷输入时不计分。",
  },
  {
    key: "consistency",
    label: "一致性",
    axisLabel: "一致性",
    basis: "按最近 30 天有训练的天数换算，30 天计满分。",
  },
] as const satisfies readonly RadarDim[];

export interface AbilityScores {
  endurance: number;
  speed: number;
  strength: number;
  recovery: number;
  consistency: number;
}

/**
 * Five-axis ability radar. Every score is a direct function of data that
 * exists; a dimension with no input scores 0 and is left out of the summary
 * row, so an empty account sees an empty state rather than a chart of zeros.
 *
 * 恢复 specifically reads `data_sufficient`. The API fills the score with a
 * neutral midpoint when nothing was measured, which is numerically identical to
 * an athlete who genuinely scored 50 — presenting it would contradict the Today
 * page, which shows the same number as 待建立基线.
 */
type AbilityRadarProps = {
  readonly sport?: string | null;
  readonly dateRange?: { readonly from: string; readonly to: string };
};

export function AbilityRadar({ sport = null, dateRange }: AbilityRadarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartConfig = useChartConfig();
  const yearAgo = useMemo(() => dateRange ?? computeRange(365), [dateRange]);
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
    const localReadiness = readiness?.local_readiness;
    const recovery =
      localReadiness?.data_sufficient === true ? localReadiness.score : 0;
    const trainingDays = new Set(runs.map((a) => a.start_time.slice(0, 10)));
    const consistency = Math.min(100, (trainingDays.size / 30) * 100);
    return { endurance, speed, strength, recovery, consistency };
  }, [pmc, runs, e1rm, readiness]);

  const measured = radarDims.filter((dim) => scores[dim.key] > 0);
  const hasAnySignal = measured.length > 0;

  useECharts(
    containerRef,
    () =>
      buildRadarOption(
        radarDims.map((dim) => dim.axisLabel),
        radarDims.map((dim) => scores[dim.key]),
        chartConfig,
      ),
    [scores.endurance, scores.speed, scores.strength, scores.recovery, scores.consistency, chartConfig],
    { chartConfig },
  );

  return (
    <Card padding="md" data-testid="ability-radar-card">
      <SectionHeader title="能力雷达" subtitle="耐力 · 速度 · 力量 · 恢复 · 一致性" />

      {hasAnySignal ? (
        <>
          <div ref={containerRef} className="mt-3 h-[300px] w-full" data-testid="ability-radar" />
          <ul className="mt-2 grid grid-cols-5 gap-2 text-center text-caption1 text-text-muted">
            {radarDims.map((dim) => (
              <li
                key={dim.key}
                className="flex flex-col rounded-lg bg-surface-sunken px-1 py-2"
              >
                <span
                  className={`font-mono text-subheadline font-semibold tabular-nums ${
                    scores[dim.key] > 0 ? "text-text-primary" : "text-text-muted"
                  }`}
                >
                  {scores[dim.key] > 0 ? Math.round(scores[dim.key]) : "--"}
                </span>
                <span>{dim.label}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-3 flex h-[280px] items-center justify-center">
          <EmptyState
            title="暂无能力数据"
            description="导入活动、连接可穿戴设备、记录训练后，雷达图会按已有数据生成。"
          />
        </div>
      )}

      <details className="mt-3 border-t border-border-subtle pt-3 text-caption1 text-text-muted">
        <summary className="cursor-pointer text-text-secondary">每项得分怎么算</summary>
        <p className="mt-2">
          0 / 50 / 100 分别代表低基线、中等参考、优秀参考。
        </p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {radarDims.map((dim) => (
            <li key={dim.key}>
              <span className="font-medium text-text-secondary">{dim.label}：</span>
              {dim.basis}
            </li>
          ))}
        </ul>
      </details>
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

function buildRadarOption(
  labels: string[],
  values: number[],
  chartConfig: ChartConfig,
): echarts.EChartsCoreOption {
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
