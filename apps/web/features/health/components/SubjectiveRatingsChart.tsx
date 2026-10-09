"use client";

import { useRef, useMemo } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useChartConfig, type ChartConfig } from "@shared/hooks/useChartConfig";
import { useECharts } from "@shared/hooks/useECharts";
import { EmptyState } from "@shared/ui/EmptyState";
import { EMPTY_LABEL } from "@shared/lib/use-data-state";
import type { WellnessPoint } from "@features/health/hooks/useWellness";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface SubjectiveRatingsChartProps {
  data: WellnessPoint[];
}

/** 各主观感受的标签；等级语义见指标注册表（Intervals.icu 1–4 等级）。 */
const RATING_SERIES = [
  { field: "fatigue", label: "疲劳", color: "warning" },
  { field: "soreness", label: "酸痛", color: "error" },
  { field: "stress", label: "压力", color: "atl" },
  { field: "mood", label: "心情", color: "success" },
  { field: "motivation", label: "动机", color: "exercise" },
  { field: "injury_status", label: "伤病", color: "tsb" },
  { field: "hydration", label: "水分", color: "sportSwim" },
  { field: "sleep_quality", label: "睡眠质量", color: "sleep" },
] as const;

/** 主观感受 1–4 等级多折线图（Intervals.icu 等级）。 */
export function SubjectiveRatingsChart({ data }: SubjectiveRatingsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartConfig = useChartConfig();

  const series = useMemo(
    () => [...data].sort((a, b) => a.day.localeCompare(b.day)).slice(-90),
    [data],
  );

  useECharts(
    containerRef,
    () => buildOption(series, chartConfig),
    [series, chartConfig],
    { chartConfig },
  );

  const fields = RATING_SERIES.map((entry) => entry.field);
  const hasData = series.some((point) =>
    fields.some((field) => point[field] != null),
  );

  return (
    <div className="relative">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-subheadline font-semibold uppercase tracking-wider text-text-muted">
          主观感受
        </h3>
        <span className="text-caption1 text-text-muted">Intervals.icu 1–4 等级</span>
      </div>
      <div ref={containerRef} className="min-h-[200px] w-full lg:h-[180px]" data-testid="wellness-subjective-chart" />
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-card">
          <EmptyState title={EMPTY_LABEL} description="记录每日主观感受后，这里将展示各项等级趋势" />
        </div>
      )}
    </div>
  );
}

function buildOption(
  points: WellnessPoint[],
  chartConfig: ChartConfig,
): echarts.EChartsCoreOption {
  const c = chartConfig.colors;
  const days = points.map((p) => p.day.slice(5));
  return {
    grid: { left: 40, right: 16, top: 16, bottom: 16 },
    xAxis: { data: days },
    yAxis: {
      min: 1,
      max: 4,
      interval: 1,
      nameTextStyle: { color: c.textMuted, fontSize: 10 },
    },
    series: RATING_SERIES.map((entry) => ({
      name: entry.label,
      type: "line",
      data: points.map((p) => p[entry.field]),
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 1.5, color: c[entry.color] },
      itemStyle: { color: c[entry.color] },
      connectNulls: true,
    })),
  };
}
