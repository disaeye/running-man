"use client";

import { useRef, useMemo } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, MarkLineComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useChartConfig, type ChartConfig } from "@shared/hooks/useChartConfig";
import { useECharts } from "@shared/hooks/useECharts";
import { Card } from "@shared/ui/Card";
import { Badge } from "@shared/ui/Badge";
import { EmptyState } from "@shared/ui/EmptyState";
import { EMPTY_LABEL } from "@shared/lib/use-data-state";
import type { WellnessPoint } from "@features/health/hooks/useWellness";
import { RHR_ANOMALY_BPM } from "./recovery";

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

interface RestingHRTrendProps {
  data: WellnessPoint[];
}

function buildOption(
  points: WellnessPoint[],
  baseline: number | null,
  chartConfig: ChartConfig,
): echarts.EChartsCoreOption {
  const c = chartConfig.colors;
  const days = points.map((p) => p.day.slice(5));
  const hrs = points.map((p) => p.resting_hr);
  const markLines: object[] = [];
  if (baseline != null) {
    markLines.push({
      yAxis: baseline,
      lineStyle: { color: c.textMuted, type: "dashed", width: 1 },
      label: {
        formatter: `基线 ${baseline.toFixed(0)}`,
        color: c.textMuted,
        fontSize: 10,
        position: "insideEndTop",
      },
    });
    markLines.push({
      yAxis: baseline + RHR_ANOMALY_BPM,
      lineStyle: { color: c.hrRest, type: "dotted", width: 1, opacity: 0.5 },
      label: {
        formatter: `异常阈值 +${RHR_ANOMALY_BPM}`,
        color: c.textMuted,
        fontSize: 10,
        position: "insideEndTop",
      },
    });
    markLines.push({
      yAxis: baseline - RHR_ANOMALY_BPM,
      lineStyle: { color: c.success, type: "dotted", width: 1, opacity: 0.5 },
      label: {
        formatter: `异常阈值 -${RHR_ANOMALY_BPM}`,
        color: c.textMuted,
        fontSize: 10,
        position: "insideEndBottom",
      },
    });
  }
  return {
    grid: { left: 40, right: 16, top: 16, bottom: 16 },
    xAxis: {
      data: days,
    },
    yAxis: {
      name: "bpm",
      nameTextStyle: { color: c.textMuted, fontSize: 10 },
    },
    series: [
      {
        name: "静息心率",
        type: "line",
        data: hrs,
        smooth: true,
        showSymbol: true,
        symbolSize: 4,
        lineStyle: { width: 2, color: c.hrRest },
        itemStyle: { color: c.hrRest },
        markLine: { silent: true, symbol: "none", data: markLines },
      },
    ],
  };
}

/**
 * Resting HR trend card. Shows the latest RHR vs 7-day baseline with
 * deviation indicator and an anomaly badge when deviation exceeds
 * RHR_ANOMALY_BPM (5 bpm — clinical threshold based on RHR variability literature).
 */
export function RestingHRTrend({ data }: RestingHRTrendProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartConfig = useChartConfig();

  const stats = useMemo(() => {
    const sorted = [...data].sort((a, b) => a.day.localeCompare(b.day));
    const last = [...sorted].reverse().find((p) => p.resting_hr != null);
    const recent = sorted.filter((p) => p.day !== last?.day).slice(-28);
    const baseline = median(recent.map((p) => p.resting_hr));
    const deviation =
      last?.resting_hr != null && baseline != null ? last.resting_hr - baseline : null;
    const isAnomaly = deviation != null && Math.abs(deviation) > RHR_ANOMALY_BPM;
    const series = sorted.slice(-30);
    return { last, baseline, deviation, isAnomaly, series };
  }, [data]);

  useECharts(
    containerRef,
    () => buildOption(stats.series, stats.baseline, chartConfig),
    [stats.series, stats.baseline, chartConfig],
    { chartConfig },
  );

  const hasData = stats.series.some((p) => p.resting_hr != null);

  return (
    <Card padding="md">
      <header className="mb-4 flex items-baseline justify-between">
        <h3 className="text-subheadline font-semibold uppercase tracking-wider text-text-muted">
          静息心率趋势
        </h3>
        <span className="text-caption1 text-text-muted">28日滚动中位数 · ±{RHR_ANOMALY_BPM} bpm</span>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="当前静息心率"
          value={stats.last?.resting_hr != null ? `${stats.last.resting_hr}` : "--"}
          unit="bpm"
          tone="text-hr-rest"
        />
        <Stat
          label="28日基线"
          value={stats.baseline != null ? `${stats.baseline.toFixed(0)}` : "--"}
          unit="bpm"
        />
        <div className="flex flex-col gap-1">
          <span className="text-caption1 text-text-secondary">较基线偏离</span>
          <div className="flex items-baseline gap-2">
            <span
              className={`font-mono text-title1 font-bold ${
                stats.deviation == null
                  ? "text-text-muted"
                    : Math.abs(stats.deviation) > RHR_ANOMALY_BPM
                    ? "text-recovery-poor"
                    : stats.deviation > 0
                      ? "text-recovery-moderate"
                      : "text-recovery-good"
              }`}
            >
              {stats.deviation != null ? `${stats.deviation > 0 ? "+" : ""}${stats.deviation.toFixed(0)}` : "--"}
            </span>
            <span className="text-caption1 text-text-muted">bpm</span>
            {stats.isAnomaly && (
              <Badge variant="error" className="ml-auto">
                异常波动
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="relative">
        <div ref={containerRef} className="mt-4 min-h-[200px] w-full lg:h-[180px]" data-testid="rhr-trend-chart" />
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-card">
            <EmptyState
              title={EMPTY_LABEL}
              description="记录静息心率后，这里将展示趋势与基线"
            />
          </div>
        )}
      </div>
    </Card>
  );
}

function median(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((value): value is number => value != null).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) return valid[mid] ?? null;
  const left = valid[mid - 1];
  const right = valid[mid];
  return left != null && right != null ? (left + right) / 2 : null;
}

function Stat({
  label,
  value,
  unit,
  tone = "text-text-primary",
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption1 text-text-secondary">{label}</span>
      <span className={`font-mono text-title1 font-bold ${tone}`}>
        {value}
        {unit && <span className="ml-1 text-caption1 font-normal text-text-muted">{unit}</span>}
      </span>
    </div>
  );
}
