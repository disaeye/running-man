"use client";

import { useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useChartConfig, type ChartConfig } from "@shared/hooks/useChartConfig";
import { useECharts } from "@shared/hooks/useECharts";
import { useIntensityDistribution } from "@features/performance/hooks/useIntensityDistribution";
import { ChartShell } from "@shared/ui/ChartShell";
import { EmptyState } from "@shared/ui/EmptyState";
import { EMPTY_LABEL, LOADING_LABEL } from "@shared/lib/use-data-state";

echarts.use([
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

const ZONE_NAMES = ["Zone 1 恢复", "Zone 2 有氧", "Zone 3 节奏", "Zone 4 阈值", "Zone 5 极限"];

export interface IntensityPoint {
  /** Week label, e.g. "W24" or date */
  bucket: string;
  /** Seconds spent in each zone (indices 0..4) */
  zoneSeconds: [number, number, number, number, number];
}

function toMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}

function buildOption(data: IntensityPoint[], chartConfig: ChartConfig): echarts.EChartsCoreOption {
  const c = chartConfig.colors;
  const zoneColors = [c.zone1, c.zone2, c.zone3, c.zone4, c.zone5] as const;
  const buckets = data.map((d) => d.bucket);
  const zoneSeries = ZONE_NAMES.map((name, idx) => ({
    name,
    type: "bar" as const,
    stack: "total" as const,
    data: data.map((d) => toMinutes(d.zoneSeconds[idx] ?? 0)),
    itemStyle: { color: zoneColors[idx] },
    emphasis: { focus: "series" as const },
  }));

  return {
    tooltip: {
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const items = params as { seriesName: string; value: number; color: string }[];
        if (!Array.isArray(items)) return "";
        const lines = items.map(
          (it) =>
            `<span style="color:${it.color}">●</span> ${it.seriesName}: ${it.value} min`,
        );
        return lines.join("<br/>");
      },
    },
    legend: {
      data: [...ZONE_NAMES],
    },
    grid: { bottom: 16 },
    xAxis: {
      data: buckets,
    },
    yAxis: {
      name: "分钟",
      nameTextStyle: { color: c.textMuted },
    },
    series: zoneSeries,
  };
}

/**
 * Tab 3: 强度分布
 * Stacked bar chart showing weekly time-in-zone distribution.
 * Uses --color-zone-1 through --color-zone-5 tokens.
 */
export function PerformanceIntensity() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { data, loading, error } = useIntensityDistribution();
  const chartConfig = useChartConfig();

  useECharts(containerRef, () => buildOption(data, chartConfig), [data, chartConfig], {
    chartConfig,
  });

  return (
    <ChartShell title="周强度分布">
      <div className="min-h-[200px] lg:h-[340px]">
        {error && (
          <div className="flex h-full items-center justify-center text-subheadline text-error">
            {error}
          </div>
        )}
        {loading && !error && (
          <div className="flex h-full items-center justify-center text-subheadline text-text-muted">
            {LOADING_LABEL}
          </div>
        )}
        {!loading && !error && data.length === 0 && (
          <EmptyState
            title={EMPTY_LABEL}
            description="需要活动心率/功率数据，以及最大心率或 FTP 才能计算区间分布"
          />
        )}
        {!loading && !error && data.length > 0 && (
          <div ref={containerRef} className="h-full w-full" data-testid="intensity-chart" />
        )}
      </div>
    </ChartShell>
  );
}
