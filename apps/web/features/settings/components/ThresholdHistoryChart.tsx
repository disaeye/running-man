"use client";

import { useMemo, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { useECharts } from "@shared/hooks/useECharts";
import { useChartConfig, type ChartConfig } from "@shared/hooks/useChartConfig";
import { Card } from "@shared/ui/Card";
import { EmptyState } from "@shared/ui/EmptyState";
import { EMPTY_LABEL, NO_VALUE } from "@shared/lib/use-data-state";
import { formatPaceFromSeconds } from "@shared/lib/format";
import { useThresholdHistory } from "@features/settings/hooks/useThresholdHistory";

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

type ThresholdMetric = "threshold_pace" | "lthr";

const METRICS: ReadonlyArray<{ key: ThresholdMetric; label: string }> = [
  { key: "threshold_pace", label: "阈值配速" },
  { key: "lthr", label: "乳酸阈心率" },
];

function buildOption(
  entries: ReturnType<typeof useThresholdHistory>["entries"],
  chartConfig: ChartConfig,
): EChartsCoreOption {
  const colors = chartConfig.colors;
  return {
    color: [colors.accent, colors.zone3],
    grid: { left: 44, right: 20, top: 28, bottom: 36 },
    legend: { top: 0, textStyle: { color: colors.textSecondary } },
    tooltip: {
      trigger: "axis",
      formatter: (raw: unknown) => {
        const items = Array.isArray(raw) ? raw as { seriesName: string; value: number | null; axisValue: string }[] : [];
        const date = items[0]?.axisValue;
        if (!date) return "";
        return [date, ...items.map((item) => {
          const value = item.value == null
            ? NO_VALUE
            : item.seriesName === "阈值配速"
              ? `${formatPaceFromSeconds(item.value)}/km`
              : `${Math.round(item.value)} bpm`;
          return `${item.seriesName}: ${value}`;
        })].join("<br/>");
      },
    },
    xAxis: { type: "category", data: entries.map((entry) => entry.effective_from) },
    yAxis: [
      {
        type: "value",
        name: "阈值配速",
        inverse: true,
        scale: true,
        axisLabel: { color: colors.textMuted, formatter: (value: number) => formatPaceFromSeconds(value) },
        nameTextStyle: { color: colors.textMuted },
      },
      {
        type: "value",
        name: "心率 bpm",
        scale: true,
        axisLabel: { color: colors.textMuted, formatter: (value: number) => `${Math.round(value)}` },
        nameTextStyle: { color: colors.textMuted },
      },
    ],
    series: [
      {
        name: "阈值配速",
        type: "line",
        yAxisIndex: 0,
        connectNulls: false,
        showSymbol: true,
        symbolSize: 7,
        data: entries.map((entry) => entry.threshold_pace ?? null),
        lineStyle: { color: colors.accent, width: 2 },
        itemStyle: { color: colors.accent },
      },
      {
        name: "乳酸阈心率",
        type: "line",
        yAxisIndex: 1,
        connectNulls: false,
        showSymbol: true,
        symbolSize: 7,
        data: entries.map((entry) => entry.lthr ?? null),
        lineStyle: { color: colors.zone3, width: 2 },
        itemStyle: { color: colors.zone3 },
      },
    ],
  };
}

function formatThresholdMetric(
  key: ThresholdMetric,
  entry: ReturnType<typeof useThresholdHistory>["entries"][number],
): string {
  const value = entry[key];
  if (value == null) return NO_VALUE;
  return key === "threshold_pace"
    ? `${formatPaceFromSeconds(value)}/km`
    : `${Math.round(value)} bpm`;
}

function latestValues(entries: ReturnType<typeof useThresholdHistory>["entries"]) {
  return METRICS.map((metric) => ({
    ...metric,
    entry: [...entries].reverse().find((row) => row[metric.key] != null) ?? null,
  }));
}

export function ThresholdHistoryChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartConfig = useChartConfig();
  const { entries, loading, error } = useThresholdHistory();
  const metrics = useMemo(() => latestValues(entries), [entries]);

  useECharts(
    chartRef,
    () => buildOption(entries, chartConfig),
    [entries, chartConfig],
    { chartConfig },
  );

  return (
    <Card padding="md" data-testid="threshold-history-card">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-title3 font-semibold text-text-primary">跑步阈值变化</h2>
        <span className="text-caption1 text-text-muted">按生效日期记录</span>
      </div>
      {loading ? (
        <div className="mt-4 h-56 animate-pulse rounded-xl bg-surface-overlay" aria-label="正在读取阈值历史" />
      ) : error ? (
        <div role="alert" className="mt-4 flex items-start gap-3 rounded-lg border border-error/30 bg-error/5 p-4 text-error">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-subheadline font-medium">读取阈值历史失败</p>
            <p className="mt-1 text-caption1">{error}</p>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <EmptyState title={EMPTY_LABEL} description="完成跑步训练并更新个人阈值后，这里会显示历史变化。" className="mt-4" />
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            {metrics.map(({ key, label, entry }) => (
              <div key={key} className="rounded-lg bg-surface-overlay px-3 py-2.5">
                <dt className="text-caption1 text-text-muted">{label}</dt>
                <dd className="mt-1 font-mono text-title2 font-bold tabular-nums text-text-primary">
                  {entry == null ? NO_VALUE : formatThresholdMetric(key, entry)}
                </dd>
                <dd className="mt-1 text-caption1 text-text-muted">{entry?.effective_from ?? "未记录"}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 h-64 w-full" ref={chartRef} data-testid="threshold-history-chart" role="img" aria-label="阈值配速与乳酸阈心率历史趋势" />
          <p className="mt-2 text-caption1 text-text-muted">阈值配速与心率各用独立纵轴，生效日期来自个人阈值记录。</p>
        </>
      )}
    </Card>
  );
}
