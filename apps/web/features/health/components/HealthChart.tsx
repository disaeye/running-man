"use client";

import { useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useChartConfig, type ChartConfig } from "@shared/hooks/useChartConfig";
import { useECharts } from "@shared/hooks/useECharts";
import { EmptyState } from "@shared/ui/EmptyState";
import { EMPTY_LABEL } from "@shared/lib/use-data-state";
import type { WellnessPoint } from "@features/health/hooks/useWellness";

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface HealthChartProps {
  data: WellnessPoint[];
}

function buildOption(data: WellnessPoint[], chartConfig: ChartConfig): echarts.EChartsCoreOption {
  const c = chartConfig.colors;
  const days = data.map((p) => p.day);
  const hrValues = data.map((p) => p.resting_hr);
  const weightValues = data.map((p) => p.weight);

  return {
    legend: {
      data: ["静息心率", "体重"],
    },
    grid: { left: 52, right: 52, top: 40, bottom: 24 },
    xAxis: {
      data: days,
    },
    yAxis: [
      {
        name: "HR bpm",
        nameTextStyle: { color: c.textMuted, fontSize: 11 },
      },
      {
        type: "value",
        name: "体重 kg",
        nameTextStyle: { color: c.textMuted, fontSize: 11 },
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: { color: c.textMuted, fontSize: 11 },
      },
    ],
    series: [
      {
        name: "静息心率",
        type: "line",
        yAxisIndex: 0,
        data: hrValues,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: c.hrRest },
        itemStyle: { color: c.hrRest },
        connectNulls: true,
      },
      {
        name: "体重",
        type: "line",
        yAxisIndex: 1,
        data: weightValues,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: c.weight },
        itemStyle: { color: c.weight },
        connectNulls: true,
      },
    ],
  };
}

export function HealthChart({ data }: HealthChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartConfig = useChartConfig();
  const hasData = data.some((p) => p.resting_hr != null || p.weight != null);
  useECharts(containerRef, () => buildOption(data, chartConfig), [data, chartConfig], {
    chartConfig,
  });

  return (
    <div className="relative h-full w-full min-h-[200px]">
      <div ref={containerRef} className="h-full w-full" data-testid="health-chart-container" />
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-card">
          <EmptyState
            title={EMPTY_LABEL}
            description="记录静息心率或体重后，这里将展示健康趋势"
          />
        </div>
      )}
    </div>
  );
}
