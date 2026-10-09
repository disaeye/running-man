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
import { METRIC_REGISTRY, type MetricKey } from "@shared/config/generated/metric-registry";
import type { WellnessPoint } from "@features/health/hooks/useWellness";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface WellnessMetricChartProps {
  /** 指标 key，标签 / 单位 / 精度全部来自指标注册表 */
  metricKey: MetricKey;
  /** 从 WellnessPoint 取值的字段名 */
  field: Exclude<keyof WellnessPoint, "day">;
  data: WellnessPoint[];
  /** 折线颜色（useChartConfig 的 token） */
  color: keyof ChartConfig["colors"];
  /** 空状态描述 */
  emptyDescription?: string;
  /** 最近 N 天窗口，默认 90 */
  windowDays?: number;
}

/** 通用健康指标趋势图：单一指标、注册表驱动的标签与单位。 */
export function WellnessMetricChart({
  metricKey,
  field,
  data,
  color,
  emptyDescription,
  windowDays = 90,
}: WellnessMetricChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartConfig = useChartConfig();
  const definition = METRIC_REGISTRY[metricKey];

  const series = useMemo(() => {
    const sorted = [...data].sort((a, b) => a.day.localeCompare(b.day));
    return sorted.slice(-windowDays);
  }, [data, windowDays]);

  useECharts(
    containerRef,
    () => buildOption(series, field, color, chartConfig, definition.display_unit),
    [series, field, color, chartConfig, definition.display_unit],
    { chartConfig },
  );

  const values = series.map((p) => p[field]);
  const last = [...series].reverse().find((p) => p[field] != null);
  const lastValue = last?.[field];
  const recent7 = series.slice(-7).map((p) => p[field]);
  const valid7 = recent7.filter((v): v is number => v != null);
  const avg7 = valid7.length > 0 ? valid7.reduce((a, b) => a + b, 0) / valid7.length : null;
  const hasData = values.some((v) => v != null);

  return (
    <div className="relative">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-subheadline font-semibold uppercase tracking-wider text-text-muted">
          {definition.display_name}
        </h3>
        <span className="text-caption1 text-text-muted">
          {lastValue != null ? `${formatValue(lastValue, definition.ui_precision)} ${definition.display_unit}` : "--"}
          {avg7 != null && (
            <span className="ml-2">7日均 {formatValue(avg7, definition.ui_precision)}</span>
          )}
        </span>
      </div>
      <div ref={containerRef} className="min-h-[200px] w-full lg:h-[180px]" data-testid={`wellness-${metricKey}-chart`} />
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-card">
          <EmptyState
            title={EMPTY_LABEL}
            description={emptyDescription ?? `记录${definition.display_name}后，这里将展示趋势`}
          />
        </div>
      )}
    </div>
  );
}

function buildOption(
  points: WellnessPoint[],
  field: Exclude<keyof WellnessPoint, "day">,
  color: keyof ChartConfig["colors"],
  chartConfig: ChartConfig,
  unit: string,
): echarts.EChartsCoreOption {
  const c = chartConfig.colors;
  const days = points.map((p) => p.day.slice(5));
  const values = points.map((p) => p[field]);
  return {
    grid: { left: 48, right: 16, top: 16, bottom: 16 },
    xAxis: { data: days },
    yAxis: {
      name: unit,
      nameTextStyle: { color: c.textMuted, fontSize: 10 },
      scale: true,
    },
    series: [
      {
        type: "line",
        data: values,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: c[color] },
        itemStyle: { color: c[color] },
        connectNulls: true,
      },
    ],
  };
}

function formatValue(value: number, precision: number): string {
  return Number(value.toFixed(precision)).toLocaleString("zh-CN");
}
