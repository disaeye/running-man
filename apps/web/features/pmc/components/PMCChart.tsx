"use client";

import { useRef, useState, useMemo } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { useChartConfig, type ChartConfig } from "@shared/hooks/useChartConfig";
import { useECharts } from "@shared/hooks/useECharts";
import type { PmcPoint } from "@features/pmc/hooks/usePmcData";
import { formatTss } from "@shared/lib/chart-preset";
import { EMPTY_LABEL } from "@shared/lib/use-data-state";
import { EmptyState } from "@shared/ui/EmptyState";
import { getTsbBands, type TsbBandTone } from "@features/pmc/lib/pmc-bands";
import { RangeSelector, type RangeKey } from "./RangeSelector";
import { PmcStatBlocks } from "./PmcStatBlocks";
import { computeRange } from "@shared/lib/format";
import { withAlpha } from "@shared/lib/chart-tokens";

echarts.use([
  LineChart, GridComponent, TooltipComponent, DataZoomComponent, LegendComponent,
  MarkAreaComponent, MarkLineComponent, MarkPointComponent, CanvasRenderer,
]);

export interface PmcAnnotation {
  date: string;
  label: string;
  type: "race" | "goal";
}

function bandColor(tone: TsbBandTone, chartConfig: ChartConfig): string {
  const c = chartConfig.colors;
  switch (tone) {
    case "error":
      return c.error;
    case "warning":
      return c.warning;
    case "accent":
      return c.accent;
    case "success":
      return c.success;
  }
}

function filterDataByRange(data: PmcPoint[], rangeKey: RangeKey): PmcPoint[] {
  if (rangeKey === "All" || data.length === 0) return data;
  const daysMap: Record<string, number> = { "1M": 30, "3M": 90, "6M": 180, "1Y": 365 };
  const days = daysMap[rangeKey];
  if (!days) return data;
  const { from } = computeRange(days);
  return data.filter((p) => p.day >= from);
}

interface PMCChartProps {
  data: PmcPoint[];
  annotations?: PmcAnnotation[];
}

function buildOption(
  data: PmcPoint[],
  chartConfig: ChartConfig,
  annotations: PmcAnnotation[],
): EChartsCoreOption {
  const c = chartConfig.colors;
  const days = data.map((p) => p.day);
  const ctlValues = data.map((p) => p.ctl);
  const atlValues = data.map((p) => p.atl);
  const tsbValues = data.map((p) => p.tsb);
  const tsbBands = getTsbBands(chartConfig.isDark);

  const annotationMarkers = annotations
    .filter((a) => days.includes(a.date))
    .map((a) => ({
      name: a.label,
      xAxis: a.date,
      yAxis: ctlValues[days.indexOf(a.date)] ?? 0,
      symbol: a.type === "race" ? "diamond" : "circle",
      symbolSize: 10,
      itemStyle: { color: a.type === "race" ? c.error : c.warning },
      label: {
        show: true,
        formatter: a.label,
        position: "top",
        color: c.textSecondary,
        fontSize: 10,
      },
    }));

  return {
    tooltip: {
      formatter: (params: unknown) => {
        const items = params as { dataIndex: number }[];
        if (!Array.isArray(items) || items.length === 0) return "";
        const point = items[0] ? data[items[0].dataIndex] : undefined;
        if (!point) return "";
        return [
          `<div style="font-weight:600;margin-bottom:4px">${point.day}</div>`,
          `<span style="color:${c.ctl}">●</span> 体能(CTL): ${point.ctl.toFixed(1)}`,
          `<br/><span style="color:${c.atl}">●</span> 疲劳(ATL): ${point.atl.toFixed(1)}`,
          `<br/><span style="color:${c.tsb}">●</span> 状态(TSB): ${point.tsb.toFixed(1)}`,
          `<br/><span style="color:${c.textMuted}">TSS: ${formatTss(point.tss)}</span>`,
          point.acwr != null
            ? `<br/><span style="color:${c.textMuted}">负荷比(ACWR): ${point.acwr.toFixed(2)}</span>`
            : "",
        ]
          .filter(Boolean)
          .join("");
      },
    },
    legend: { data: ["体能(CTL)", "疲劳(ATL)", "状态(TSB)"] },
    grid: { bottom: 56 },
    xAxis: { data: days },
    yAxis: {},
    dataZoom: [
      {
        type: "slider",
        start: 0,
        end: 100,
        bottom: 8,
        height: 20,
        borderColor: c.borderSubtle,
        backgroundColor: c.surfaceRaised,
        dataBackground: {
          lineStyle: { color: c.borderSubtle },
          areaStyle: { color: c.borderSubtle, opacity: 0.1 },
        },
        selectedDataBackground: {
          lineStyle: { color: c.ctl },
          areaStyle: { color: c.ctl, opacity: 0.1 },
        },
        handleStyle: { color: c.ctl },
        textStyle: { color: c.textMuted },
      },
    ],
    series: [
      {
        name: "体能(CTL)",
        type: "line",
        data: ctlValues,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: c.ctl },
        itemStyle: { color: c.ctl },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: withAlpha(c.ctl, "20") }, { offset: 1, color: withAlpha(c.ctl, "02") },
          ]),
        },
        markPoint: annotationMarkers.length > 0 ? { data: annotationMarkers } : undefined,
      },
      {
        name: "疲劳(ATL)",
        type: "line",
        data: atlValues,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: c.atl },
        itemStyle: { color: c.atl },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: withAlpha(c.atl, "18") }, { offset: 1, color: withAlpha(c.atl, "02") },
          ]),
        },
      },
      {
        name: "状态(TSB)",
        type: "line",
        data: tsbValues,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 1.5, color: c.tsb },
        itemStyle: { color: c.tsb },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: withAlpha(c.tsb, "40") }, { offset: 1, color: withAlpha(c.tsb, "05") },
          ]),
        },
        markLine: {
          silent: true,
          symbol: "none",
          label: { color: c.textMuted, formatter: "{b}" },
          lineStyle: { color: c.borderSubtle, type: "dashed" },
          data: [
            { name: "风险 -30", yAxis: -30 },
            { name: "疲劳 -10", yAxis: -10 },
            { name: "新鲜 +10", yAxis: 10 },
          ],
        },
        markArea: {
          silent: true,
          label: { color: c.textMuted, fontSize: 10 },
          data: tsbBands.map((band) => [
            {
              name: band.label,
              yAxis: band.min,
              itemStyle: {
                color: bandColor(band.tone, chartConfig),
                opacity: band.opacity,
              },
            },
            { yAxis: band.max },
          ]),
        },
      },
    ],
  };
}

export function PMCChart({ data, annotations = [] }: PMCChartProps) {
  const chartConfig = useChartConfig();
  const [rangeKey, setRangeKey] = useState<RangeKey>("3M");

  const filteredData = useMemo(() => filterDataByRange(data, rangeKey), [data, rangeKey]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-title3 font-semibold text-text-primary">训练负荷趋势</h3>
        <RangeSelector
          activeRange={rangeKey}
          onRangeChange={(_from, _to, key) => setRangeKey(key)}
        />
      </div>
      {filteredData.length > 0 ? (
        <PmcChartCanvas data={filteredData} chartConfig={chartConfig} annotations={annotations} />
      ) : (
        <EmptyState title={EMPTY_LABEL} className="h-64 w-full sm:h-80" data-testid="pmc-chart-empty" />
      )}
      {filteredData.length > 0 && <PmcStatBlocks data={filteredData} />}
    </div>
  );
}

/**
 * Renders the ECharts instance. Kept as a separate component so the instance
 * only mounts (and useECharts initializes) once data is actually available —
 * an empty PMC renders the EmptyState instead of a blank coordinate system.
 */
function PmcChartCanvas({
  data,
  chartConfig,
  annotations,
}: {
  readonly data: PmcPoint[];
  readonly chartConfig: ChartConfig;
  readonly annotations: PmcAnnotation[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useECharts(
    containerRef,
    () => buildOption(data, chartConfig, annotations),
    [data, chartConfig, annotations],
    { chartConfig },
  );

  return <div ref={containerRef} className="h-64 w-full sm:h-80" data-testid="pmc-chart-container" />;
}
