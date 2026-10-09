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

interface NutritionChartProps {
  data: WellnessPoint[];
}

const MACRO_COLORS = {
  kcal: "accent",
  carbs: "exercise",
  protein: "success",
  fat: "warning",
} as const;

/** 营养摄入图：热量（左轴）与三大宏量营养素（右轴，克）。 */
export function NutritionChart({ data }: NutritionChartProps) {
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

  const hasData = series.some(
    (p) =>
      p.kcal_consumed != null || p.carbs_g != null || p.protein_g != null || p.fat_g != null,
  );
  const last = [...series]
    .reverse()
    .find((p) => p.kcal_consumed != null || p.carbs_g != null);

  return (
    <div className="relative">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-subheadline font-semibold uppercase tracking-wider text-text-muted">
          营养摄入
        </h3>
        <span className="text-caption1 text-text-muted">
          {last?.kcal_consumed != null ? `${last.kcal_consumed} kcal` : "--"}
          {last?.protein_g != null && <span className="ml-2">蛋白质 {last.protein_g} g</span>}
        </span>
      </div>
      <div ref={containerRef} className="min-h-[200px] w-full lg:h-[180px]" data-testid="wellness-nutrition-chart" />
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-card">
          <EmptyState title={EMPTY_LABEL} description="记录每日摄入后，这里将展示热量与宏量营养素趋势" />
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
    grid: { left: 56, right: 40, top: 16, bottom: 16 },
    xAxis: { data: days },
    yAxis: [
      {
        type: "value",
        name: "kcal",
        nameTextStyle: { color: c.textMuted, fontSize: 10 },
        scale: true,
      },
      {
        type: "value",
        name: "g",
        nameTextStyle: { color: c.textMuted, fontSize: 10 },
        scale: true,
        splitLine: { show: false },
        axisLabel: { color: c.textMuted, fontSize: 10 },
      },
    ],
    series: [
      {
        name: "热量",
        type: "line",
        data: points.map((p) => p.kcal_consumed),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: c[MACRO_COLORS.kcal] },
        itemStyle: { color: c[MACRO_COLORS.kcal] },
        connectNulls: true,
      },
      {
        name: "碳水",
        type: "line",
        yAxisIndex: 1,
        data: points.map((p) => p.carbs_g),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1.5, opacity: 0.8, color: c[MACRO_COLORS.carbs] },
        itemStyle: { color: c[MACRO_COLORS.carbs] },
        connectNulls: true,
      },
      {
        name: "蛋白质",
        type: "line",
        yAxisIndex: 1,
        data: points.map((p) => p.protein_g),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1.5, opacity: 0.8, color: c[MACRO_COLORS.protein] },
        itemStyle: { color: c[MACRO_COLORS.protein] },
        connectNulls: true,
      },
      {
        name: "脂肪",
        type: "line",
        yAxisIndex: 1,
        data: points.map((p) => p.fat_g),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1.5, opacity: 0.8, color: c[MACRO_COLORS.fat] },
        itemStyle: { color: c[MACRO_COLORS.fat] },
        connectNulls: true,
      },
    ],
  };
}
