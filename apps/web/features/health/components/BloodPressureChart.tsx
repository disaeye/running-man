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

interface BloodPressureChartProps {
  data: WellnessPoint[];
}

/** 血压趋势图：收缩压 / 舒张压双折线，带 130/85 参考线。 */
export function BloodPressureChart({ data }: BloodPressureChartProps) {
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

  const last = [...series].reverse().find((p) => p.systolic_bp != null || p.diastolic_bp != null);
  const hasData = series.some((p) => p.systolic_bp != null || p.diastolic_bp != null);

  return (
    <div className="relative">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-subheadline font-semibold uppercase tracking-wider text-text-muted">
          血压
        </h3>
        <span className="text-caption1 text-text-muted">
          {last?.systolic_bp != null && last?.diastolic_bp != null
            ? `${last.systolic_bp}/${last.diastolic_bp} mmHg`
            : "--"}
        </span>
      </div>
      <div ref={containerRef} className="min-h-[200px] w-full lg:h-[180px]" data-testid="wellness-bp-chart" />
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-card">
          <EmptyState title={EMPTY_LABEL} description="记录血压后，这里将展示收缩压与舒张压趋势" />
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
    grid: { left: 48, right: 16, top: 16, bottom: 16 },
    xAxis: { data: days },
    yAxis: {
      name: "mmHg",
      nameTextStyle: { color: c.textMuted, fontSize: 10 },
      scale: true,
    },
    series: [
      {
        name: "收缩压",
        type: "line",
        data: points.map((p) => p.systolic_bp),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: c.error },
        itemStyle: { color: c.error },
        connectNulls: true,
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: c.textMuted, type: "dashed", width: 1 },
          data: [
            {
              yAxis: 130,
              label: { formatter: "收缩压 130", color: c.textMuted, fontSize: 10 },
            },
          ],
        },
      },
      {
        name: "舒张压",
        type: "line",
        data: points.map((p) => p.diastolic_bp),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: c.accent },
        itemStyle: { color: c.accent },
        connectNulls: true,
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: c.textMuted, type: "dotted", width: 1 },
          data: [
            {
              yAxis: 85,
              label: { formatter: "舒张压 85", color: c.textMuted, fontSize: 10 },
            },
          ],
        },
      },
    ],
  };
}
