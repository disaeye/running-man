"use client";

import { useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  MarkPointComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { useChartConfig, type ChartConfig } from "@shared/hooks/useChartConfig";
import { useECharts } from "@shared/hooks/useECharts";
import { ChartShell } from "@shared/ui/ChartShell";
import { EmptyState } from "@shared/ui/EmptyState";
import { EMPTY_LABEL } from "@shared/lib/use-data-state";
import type { PowerCurvePoint } from "@features/activity/hooks/useActivityAnalysis";

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  MarkPointComponent,
  CanvasRenderer,
]);

interface PowerCurveChartProps {
  points: PowerCurvePoint[];
}

function labelForDuration(s: number): string {
  if (s >= 3600) return `${s / 3600}h`;
  if (s >= 60) return `${s / 60}m`;
  return `${s}s`;
}

function buildOption(points: PowerCurvePoint[], chartConfig: ChartConfig): EChartsCoreOption {
  const c = chartConfig.colors;
  const sorted = [...points].sort((a, b) => a.duration_s - b.duration_s);
  const xData = sorted.map((p) => labelForDuration(p.duration_s));
  const yData = sorted.map((p) => Math.round(p.avg_w));

  return {
    grid: { top: 24, right: 16, bottom: 28, left: 48 },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const arr = params as { axisValue: string; value: number }[];
        const p = arr[0];
        if (!p) return "";
        return `${p.axisValue}: <b>${p.value} W</b>`;
      },
    },
    xAxis: {
      data: xData,
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      name: "W",
      nameTextStyle: { color: c.textMuted, fontSize: 11, padding: [0, 28, 0, 0] },
      splitLine: { lineStyle: { color: c.borderSubtle, type: "dashed" } },
    },
    series: [
      {
        type: "line",
        data: yData,
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { width: 2, color: c.accent },
        itemStyle: { color: c.accent },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: c.accent },
              { offset: 1, color: c.surfaceRaised },
            ],
          },
        },
      },
    ],
  };
}

export function PowerCurveChart({ points }: PowerCurveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartConfig = useChartConfig();
  useECharts(containerRef, () => buildOption(points, chartConfig), [points, chartConfig], {
    chartConfig,
  });

  const hasData = points.length > 0;

  return (
    <ChartShell title="功率曲线" subtitle="各持续时间的最大功率，反映无氧与有氧能力的功率-时间关系。">
      <div className="relative h-64 w-full">
        <div ref={containerRef} className="h-full w-full" />
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-card">
            <EmptyState
              title={EMPTY_LABEL}
              description="完成带功率数据的训练后自动生成"
            />
          </div>
        )}
      </div>
    </ChartShell>
  );
}
