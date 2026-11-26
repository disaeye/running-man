"use client";

import { useRef, useMemo } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useChartConfig, type ChartConfig } from "@shared/hooks/useChartConfig";
import { useECharts } from "@shared/hooks/useECharts";
import { Card } from "@shared/ui/Card";
import { Badge } from "@shared/ui/Badge";
import { EmptyState } from "@shared/ui/EmptyState";
import { EMPTY_LABEL } from "@shared/lib/use-data-state";
import { formatDuration } from "@shared/lib/format";
import type { WellnessPoint } from "@features/health/hooks/useWellness";
import { SLEEP_TARGET_SECS, cumulativeSleepDebt, avg } from "./recovery";

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

interface SleepAnalysisProps {
  /** Wellness points for at least the last 7 days (older points used for the trend). */
  data: WellnessPoint[];
}

/** Build mini ECharts option for sleep duration + score dual-axis trend. */
function buildOption(data: WellnessPoint[], chartConfig: ChartConfig): echarts.EChartsCoreOption {
  const c = chartConfig.colors;
  const days = data.map((p) => p.day.slice(5));
  const hours = data.map((p) => (p.sleep_secs ? +(p.sleep_secs / 3600).toFixed(1) : null));
  const scores = data.map((p) => (p.sleep_score != null ? Math.round(p.sleep_score) : null));
  return {
    legend: { data: ["睡眠时长", "睡眠评分"], top: 0, textStyle: { color: c.textSecondary, fontSize: 11 } },
    grid: { left: 40, right: 44, top: 44, bottom: 24 },
    xAxis: {
      data: days,
    },
    yAxis: [
      {
        type: "value",
        name: "h",
        nameTextStyle: { color: c.textMuted, fontSize: 10 },
      },
      {
        type: "value",
        name: "分",
        nameTextStyle: { color: c.textMuted, fontSize: 10 },
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: { color: c.textMuted, fontSize: 10 },
        min: 0,
        max: 100,
      },
    ],
    series: [
      {
        name: "睡眠时长",
        type: "line",
        data: hours,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: c.sleep },
        itemStyle: { color: c.sleep },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: c.textMuted, type: "dashed", width: 1 },
          data: [
            {
              yAxis: +(SLEEP_TARGET_SECS / 3600).toFixed(1),
              label: { formatter: "目标 7h", color: c.textMuted, fontSize: 10, position: "insideEndTop" },
            },
          ],
        },
      },
      {
        name: "睡眠评分",
        type: "line",
        yAxisIndex: 1,
        data: scores,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1.5, color: c.success, opacity: 0.6 },
        itemStyle: { color: c.success },
      },
    ],
  };
}

/**
 * Sleep analysis section: last night + 7-day baseline + cumulative sleep debt
 * + small dual-axis trend chart (duration + score).
 */
export function SleepAnalysis({ data }: SleepAnalysisProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartConfig = useChartConfig();
  const sortedData = useMemo(() => [...data].sort((a, b) => a.day.localeCompare(b.day)), [data]);
  useECharts(containerRef, () => buildOption(sortedData, chartConfig), [sortedData, chartConfig], {
    chartConfig,
  });

  const stats = useMemo(() => {
    const validSleep = sortedData.filter((p) => p.sleep_secs != null && p.sleep_secs > 0);
    const last = validSleep.at(-1);
    const lastScore = [...sortedData].reverse().find((p) => p.sleep_score != null);
    const anchorDay = sortedData.at(-1)?.day ?? null;
    const cutoffDay = anchorDay
      ? new Date(Date.parse(`${anchorDay}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10)
      : null;
    const recent = cutoffDay
      ? sortedData.filter((p) => p.day >= cutoffDay && p.day <= anchorDay!)
      : sortedData.slice(-7);
    const sleepValues = recent.map((p) => (p.sleep_secs != null && p.sleep_secs > 0 ? p.sleep_secs : null));
    const avgSecs = avg(sleepValues);
    const avgScore = avg(recent.map((p) => p.sleep_score));
    const debt = cumulativeSleepDebt(sleepValues);
    const debtNights = sleepValues.filter((v) => v != null).length;
    return { last, lastScore, avgSecs, avgScore, debt, debtNights };
  }, [sortedData]);

  const debtHours = stats.debt / 3600;
  const debtPerNight = stats.debtNights > 0 ? debtHours / stats.debtNights : 0;
  const debtVariant = debtVariantFromHours(debtHours);
  const hasData = data.some((p) => (p.sleep_secs != null && p.sleep_secs > 0) || p.sleep_score != null);

  return (
    <Card padding="md">
      <header className="mb-4 flex items-baseline justify-between">
        <h3 className="text-caption1 font-semibold text-text-secondary">
          睡眠分析
        </h3>
        <span className="text-caption1 text-text-muted">目标 {SLEEP_TARGET_SECS / 3600}h / 夜</span>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SleepStat
          label="昨晚睡眠"
          value={stats.last?.sleep_secs != null ? formatDuration(stats.last.sleep_secs) : "--"}
          hint={stats.last ? stats.last.day.slice(5) : "暂无"}
        />
        <SleepStat
          label="7日均值"
          value={stats.avgSecs != null ? formatDuration(stats.avgSecs) : "--"}
          hint="最近7日"
        />
        <SleepStat
          label="睡眠评分"
          value={stats.lastScore?.sleep_score != null ? `${Math.round(stats.lastScore.sleep_score)}` : "--"}
          hint={stats.avgScore != null ? `7日均 ${Math.round(stats.avgScore)}` : "暂无"}
        />
        <div className="flex flex-col gap-1">
          <span className="text-caption1 text-text-secondary">7日睡眠负债</span>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-title1 font-bold tabular-nums text-text-primary">
              {stats.debtNights > 0 ? debtHours.toFixed(1) : "--"}
            </span>
            {stats.debtNights > 0 ? <span className="text-caption1 text-text-muted">h</span> : null}
            <Badge variant={stats.debtNights > 0 ? debtVariant : "neutral"} className="ml-auto">
              {stats.debtNights > 0 ? (debtHours >= 4 ? "高" : debtHours >= 2 ? "中" : "低") : "暂无"}
            </Badge>
          </div>
          <span className="text-caption1 text-text-muted">
            {stats.debtNights > 0 ? `平均 ${debtPerNight.toFixed(1)}h / 夜` : "暂无有效睡眠"}
          </span>
        </div>
      </div>

      <div className="relative">
        <div ref={containerRef} className="mt-4 min-h-[200px] w-full lg:h-[180px]" data-testid="sleep-trend-chart" />
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-card">
            <EmptyState
              title={EMPTY_LABEL}
              description="记录睡眠后，这里将展示时长与评分趋势"
            />
          </div>
        )}
      </div>
    </Card>
  );
}

function SleepStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption1 text-text-secondary">{label}</span>
      <span className="font-mono text-title1 font-bold tabular-nums text-text-primary">{value}</span>
      <span className="text-caption1 text-text-muted">{hint}</span>
    </div>
  );
}

function debtVariantFromHours(hours: number): "success" | "warning" | "error" {
  if (hours >= 4) return "error";
  if (hours >= 2) return "warning";
  return "success";
}
