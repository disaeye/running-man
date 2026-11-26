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
import { DisclosureCard } from "@shared/ui/DisclosureCard";
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
    grid: { left: 48, right: 48, top: 48, bottom: 36 },
    legend: { top: 4, textStyle: { color: colors.textSecondary } },
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
  const { entries, loading, error } = useThresholdHistory();
  const metrics = useMemo(() => latestValues(entries), [entries]);
  const paceSummary = metrics[0]?.entry ? formatThresholdMetric("threshold_pace", metrics[0].entry) : NO_VALUE;
  const lthrSummary = metrics[1]?.entry ? formatThresholdMetric("lthr", metrics[1].entry) : NO_VALUE;
  const summaryText = loading
    ? "正在读取阈值历史…"
    : error
      ? "读取失败，展开查看详情"
      : entries.length === 0
        ? "暂无历史记录 · 更新个人阈值后形成曲线"
        : `阈值配速 ${paceSummary} · 乳酸阈心率 ${lthrSummary} · 共 ${entries.length} 条记录`;

  return (
    <DisclosureCard
      title="跑步阈值变化"
      summary={summaryText}
      testId="threshold-history-card"
    >
      <ThresholdHistoryBody entries={entries} metrics={metrics} loading={loading} error={error} />
    </DisclosureCard>
  );
}

function ThresholdHistoryBody({
  entries,
  metrics,
  loading,
  error,
}: {
  entries: ReturnType<typeof useThresholdHistory>["entries"];
  metrics: ReturnType<typeof latestValues>;
  loading: boolean;
  error: string | null;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartConfig = useChartConfig();

  useECharts(
    chartRef,
    () => buildOption(entries, chartConfig),
    [entries, chartConfig],
    { chartConfig },
  );

  if (loading) {
    return <div className="h-56 animate-pulse rounded-xl bg-surface-overlay" aria-label="正在读取阈值历史" />;
  }
  if (error) {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-lg border border-error/30 bg-error/5 p-4 text-error">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-subheadline font-medium">读取阈值历史失败</p>
          <p className="mt-1 text-caption1">{error}</p>
        </div>
      </div>
    );
  }
  if (entries.length === 0) {
    return <EmptyState title={EMPTY_LABEL} description="完成跑步训练并更新个人阈值后，这里会显示历史变化。" />;
  }
  return (
    <>
      <dl className="grid grid-cols-2 gap-3">
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
  );
}
