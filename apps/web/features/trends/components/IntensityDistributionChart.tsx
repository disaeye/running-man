"use client";

import { useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useChartConfig, type ChartConfig } from "@shared/hooks/useChartConfig";
import { useECharts } from "@shared/hooks/useECharts";
import { DataState } from "@shared/ui/DataState";
import { useDataState } from "@shared/lib/use-data-state";
import { useIntensityDistribution } from "@features/performance/hooks/useIntensityDistribution";
import type { IntensityPoint } from "@features/performance/components/PerformanceIntensity";
import { EMPTY_INTENSITY_GUIDANCE, ZONE_DETAILS } from "@features/analysis/lib/intensity-analysis-copy";

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

function buildOption(data: IntensityPoint[], chartConfig: ChartConfig): echarts.EChartsCoreOption {
  const c = chartConfig.colors;
  const zoneColors = [c.zone1, c.zone2, c.zone3, c.zone4, c.zone5] as const;
  return {
    tooltip: {
      axisPointer: { type: "shadow" },
    },
    legend: {
      data: ZONE_DETAILS.map((zone) => zone.name),
      selectedMode: false,
    },
    grid: { left: 42, right: 16, top: 44, bottom: 28, containLabel: true },
    xAxis: {
      data: data.map((p) => p.bucket),
    },
    yAxis: {
      name: "分钟",
      nameTextStyle: { color: c.textMuted },
    },
    series: ZONE_DETAILS.map((zone, idx) => ({
      name: zone.name,
      type: "bar" as const,
      stack: "total",
      data: data.map((p) => Math.round((p.zoneSeconds[idx] ?? 0) / 60)),
      itemStyle: { color: zoneColors[idx] },
    })),
  };
}

interface IntensityDistributionChartProps {
  readonly from?: string;
  readonly to?: string;
}

export function IntensityDistributionChart({
  from,
  to,
}: IntensityDistributionChartProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { data, loading, error } = useIntensityDistribution(from, to);
  const chartConfig = useChartConfig();
  const state = useDataState({
    data: data.length > 0 ? data : null,
    error,
    isLoading: loading,
  });
  useECharts(containerRef, () => buildOption(data, chartConfig), [data, chartConfig], {
    chartConfig,
  });

  if (state === "source-empty") {
    return (
      <Message data-testid="intensity-chart-empty">
        <span className="font-semibold text-text-primary">暂无强度分布数据</span>
        <span className="max-w-md text-center text-caption1 text-text-secondary">
          {EMPTY_INTENSITY_GUIDANCE}
        </span>
      </Message>
    );
  }

  return (
    <DataState state={state} className="h-full">
      <div className="flex h-full min-h-0 flex-col gap-3 p-4">
        <ul className="grid grid-cols-2 gap-2 text-caption1 text-text-secondary sm:grid-cols-5">
          {ZONE_DETAILS.map((zone) => (
            <li key={zone.name} className="rounded-xl bg-surface-overlay px-3 py-2">
              <span className="block font-semibold text-text-primary">{zone.name}</span>
              <span>{zone.effort}</span>
            </li>
          ))}
        </ul>
        <div ref={containerRef} className="min-h-0 flex-1" data-testid="intensity-chart" />
      </div>
    </DataState>
  );
}

function Message({
  className = "text-text-muted",
  children,
  "data-testid": testId,
}: {
  className?: string;
  children: React.ReactNode;
  "data-testid"?: string;
}) {
  return (
    <div
      className={`flex h-full flex-col items-center justify-center gap-2 text-sm ${className}`}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
