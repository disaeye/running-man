"use client";

import { useRef, useMemo } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useChartConfig, type ChartConfig } from "@shared/hooks/useChartConfig";
import { useECharts } from "@shared/hooks/useECharts";
import { Badge } from "@shared/ui/Badge";
import { ChartShell } from "@shared/ui/ChartShell";
import { EmptyState } from "@shared/ui/EmptyState";
import { EMPTY_LABEL } from "@shared/lib/use-data-state";
import type { WellnessPoint } from "@features/health/hooks/useWellness";
import type { PmcPoint } from "@features/pmc/hooks/usePmcData";

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface TrainingRecoveryCorrelationProps {
  wellness: WellnessPoint[];
  loads: PmcPoint[];
}

interface CorrelationRow {
  day: string;
  tss: number | null;
  /** RHR measured the day AFTER this training day. */
  nextDayRhr: number | null;
}

/**
 * Pair each training day with the recovery signal measured the following day.
 * Drops rows where TSS is null/zero (rest days — no training stimulus).
 */
function buildCorrelation(wellness: WellnessPoint[], loads: PmcPoint[]): CorrelationRow[] {
  const rhrByDay = new Map<string, number>();
  for (const w of wellness) {
    if (w.resting_hr != null) rhrByDay.set(w.day.slice(0, 10), w.resting_hr);
  }
  const rows: CorrelationRow[] = [];
  for (const load of loads) {
    if (load.tss == null || load.tss <= 0) continue;
    const next = new Date(load.day);
    next.setDate(next.getDate() + 1);
    const nextKey = next.toISOString().slice(0, 10);
    rows.push({
      day: load.day.slice(0, 10),
      tss: load.tss,
      nextDayRhr: rhrByDay.get(nextKey) ?? null,
    });
  }
  return rows;
}

/** Pearson-style mean delta: how much higher is next-day RHR after hard days? */
function percentile75(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * 0.75) - 1;
  return sorted[Math.max(0, index)] ?? null;
}

function nextDayDelta(rows: CorrelationRow[]): { delta: number; samples: number; threshold: number } | null {
  const paired = rows.filter((r) => r.nextDayRhr != null && r.tss != null);
  if (paired.length < 3) return null;
  const hardThreshold = percentile75(paired.map((r) => r.tss ?? 0));
  if (hardThreshold == null) return null;
  const hard = paired.filter((r) => (r.tss ?? 0) >= hardThreshold);
  const easy = paired.filter((r) => (r.tss ?? 0) < hardThreshold);
  if (hard.length === 0 || easy.length === 0) return null;
  const avg = (arr: CorrelationRow[]) =>
    arr.reduce((s, r) => s + (r.nextDayRhr as number), 0) / arr.length;
  return {
    delta: +(avg(hard) - avg(easy)).toFixed(1),
    samples: paired.length,
    threshold: Math.round(hardThreshold),
  };
}

function buildOption(rows: CorrelationRow[], chartConfig: ChartConfig): echarts.EChartsCoreOption {
  const c = chartConfig.colors;
  const days = rows.map((r) => r.day.slice(5));
  const rhrValues = rows.map((r) => r.nextDayRhr).filter((v): v is number => v != null);
  const rhrAxisRange: { min?: number; max?: number } =
    rhrValues.length > 0
      ? {
          min: Math.floor(Math.min(...rhrValues) - 10),
          max: Math.ceil(Math.max(...rhrValues) + 10),
        }
      : {};
  return {
    tooltip: {
      axisPointer: { type: "shadow" },
    },
    legend: {
      data: ["训练负荷 TSS", "次日静息心率"],
    },
    grid: { left: 48, right: 16, top: 32, bottom: 16 },
    xAxis: {
      data: days,
    },
    yAxis: [
      {
        type: "value",
        name: "TSS",
        nameTextStyle: { color: c.textMuted, fontSize: 10 },
      },
      {
        type: "value",
        name: "次日 RHR",
        nameTextStyle: { color: c.textMuted, fontSize: 10 },
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: { color: c.textMuted, fontSize: 10 },
        ...rhrAxisRange,
      },
    ],
    series: [
      {
        name: "训练负荷 TSS",
        type: "bar",
        data: rows.map((r) => r.tss),
        itemStyle: { color: c.atl, opacity: 0.65 },
      },
      {
        name: "次日静息心率",
        type: "line",
        yAxisIndex: 1,
        data: rows.map((r) => r.nextDayRhr),
        smooth: true,
        showSymbol: true,
        symbolSize: 5,
        lineStyle: { width: 2, color: c.hrRest },
        itemStyle: { color: c.hrRest },
        connectNulls: false,
      },
    ],
  };
}

/**
 * Training-recovery correlation card.
 * Bars show daily training TSS; the line tracks next-day resting HR.
 * A short insight string summarises the average next-day RHR delta after hard days.
 */
export function TrainingRecoveryCorrelation({ wellness, loads }: TrainingRecoveryCorrelationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartConfig = useChartConfig();
  const rows = useMemo(() => buildCorrelation(wellness, loads), [wellness, loads]);
  const insight = useMemo(() => nextDayDelta(rows), [rows]);

  useECharts(containerRef, () => buildOption(rows, chartConfig), [rows, chartConfig], {
    chartConfig,
  });

  const hasData = rows.length > 0;
  const tone: "success" | "warning" | "error" | "neutral" =
    insight == null
      ? "neutral"
      : insight.delta > 3
        ? "error"
        : insight.delta > 1
          ? "warning"
          : "success";

  return (
    <ChartShell
      title="训练—恢复关联"
      subtitle="每日训练负荷 vs. 次日静息心率"
      legend={
        insight ? (
          <Badge variant={tone} className="text-subheadline">
            高负荷日次日 RHR {insight.delta > 0 ? "+" : ""}
            {insight.delta} bpm
          </Badge>
        ) : (
          <Badge variant="neutral" className="text-subheadline">样本不足</Badge>
        )
      }
    >
      <div className="relative h-[200px] w-full">
        <div ref={containerRef} className="h-full w-full" data-testid="training-recovery-chart" />
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-card">
            <EmptyState
              title={EMPTY_LABEL}
              description="需要同时具备训练与健康数据才能呈现关联分析"
            />
          </div>
        )}
      </div>
      {insight && (
        <p className="mt-3 text-caption1 text-text-secondary">
          基于 {insight.samples} 个训练日样本，个人 75 分位强度阈值为 TSS≥{insight.threshold} 的训练日后次日 RHR
          平均较轻松日 {insight.delta > 0 ? "升高" : "降低"} {Math.abs(insight.delta)} bpm。
        </p>
      )}
    </ChartShell>
  );
}
