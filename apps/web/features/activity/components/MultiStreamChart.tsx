"use client";

import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { ChartShell } from "@shared/ui/ChartShell";
import { useChartConfig } from "@shared/hooks/useChartConfig";
import { formatPace } from "@shared/lib/format";
import type { ChartColors } from "@shared/lib/chart-tokens";
import type { StreamMap } from "@shared/types/activity";

type StreamKey =
  | "heart_rate"
  | "speed"
  | "cadence"
  | "altitude"
  | "vertical_oscillation"
  | "ground_contact_time"
  | "stride_length"
  | "temperature";
type ScaleGroup = "rate" | "metric";

interface StreamDef {
  key: StreamKey;
  label: string;
  unit: string;
  scale: ScaleGroup;
}

const STREAM_DEFS: StreamDef[] = [
  { key: "heart_rate", label: "心率", unit: "bpm", scale: "rate" },
  { key: "speed", label: "配速", unit: "m/s", scale: "metric" },
  { key: "cadence", label: "步频", unit: "spm", scale: "rate" },
  { key: "altitude", label: "海拔", unit: "m", scale: "metric" },
  { key: "vertical_oscillation", label: "垂直振幅", unit: "cm", scale: "metric" },
  { key: "ground_contact_time", label: "触地时间", unit: "ms", scale: "rate" },
  { key: "stride_length", label: "步幅", unit: "m", scale: "metric" },
  { key: "temperature", label: "温度", unit: "°C", scale: "metric" },
];

const AXIS_FONT = "11px var(--font-mono)";

function colorForStream(key: StreamKey, colors: ChartColors): string {
  switch (key) {
    case "heart_rate":
      return colors.hrRest;
    case "speed":
      return colors.tsb;
    case "cadence":
      return colors.accent;
    case "altitude":
      return colors.success;
    case "vertical_oscillation":
      return colors.warning;
    case "ground_contact_time":
      return colors.error;
    case "stride_length":
      return colors.exercise;
    case "temperature":
      return colors.weight;
  }
}

function fmtValue(def: StreamDef, v: number | null): string {
  if (v == null) return "--";
  if (def.key === "speed") return formatPace(v);
  return def.scale === "rate" ? `${Math.round(v)} ${def.unit}` : `${v.toFixed(1)} ${def.unit}`;
}

function buildPlotData(active: StreamDef[], streams: StreamMap): uPlot.AlignedData {
  const first = active[0];
  if (!first) return [[]] as unknown as uPlot.AlignedData;
  const refPoints = streams[first.key] ?? [];
  const ts: number[] = refPoints.map((p) => new Date(p.sample_time).getTime() / 1000);

  const yCols: (number | null)[][] = [];
  for (const def of active) {
    const pts = streams[def.key] ?? [];
    const vals: (number | null)[] = new Array(ts.length).fill(null);
    for (let i = 0; i < Math.min(ts.length, pts.length); i++) {
      const pt = pts[i];
      if (!pt) continue;
      const v = Number(pt.value);
      vals[i] = Number.isFinite(v) ? v : null;
    }
    yCols.push(vals);
  }
  return [ts, ...yCols] as unknown as uPlot.AlignedData;
}

function buildOpts(container: HTMLElement, active: StreamDef[], colors: ChartColors): uPlot.Options {
  const hasRate = active.some((d) => d.scale === "rate");
  const hasMetric = active.some((d) => d.scale === "metric");

  const axes: uPlot.Axis[] = [
    {
      grid: { stroke: colors.borderSubtle, width: 1 },
      ticks: { stroke: colors.borderDefault },
      font: AXIS_FONT,
      stroke: colors.textMuted,
    },
  ];
  if (hasRate) {
    axes.push({
      scale: "rate",
      side: 3,
      grid: { stroke: colors.borderSubtle, width: 1 },
      font: AXIS_FONT,
      stroke: colors.textMuted,
      size: 50,
    });
  }
  if (hasMetric) {
    axes.push({
      scale: "metric",
      side: 1,
      grid: { show: false },
      font: AXIS_FONT,
      stroke: colors.textMuted,
      size: 50,
    });
  }

  return {
    width: container.clientWidth || 800,
    height: 300,
    cursor: { drag: { x: true, y: false, uni: 30 } },
    legend: { show: true },
    series: [
      {},
      ...active.map((def) => ({
        label: def.label,
        stroke: colorForStream(def.key, colors),
        width: 1.5,
        points: { show: false },
        scale: def.scale,
        value: (_u: uPlot, v: number | null) => fmtValue(def, v),
      })),
    ],
    axes,
    scales: {
      x: { time: true },
      ...(hasRate ? { rate: { auto: true } } : {}),
      ...(hasMetric ? { metric: { auto: true } } : {}),
    },
  };
}

export function MultiStreamChart({ streams }: { streams: StreamMap }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const chartConfig = useChartConfig();

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;

    const active = STREAM_DEFS.filter((d) => (streams[d.key]?.length ?? 0) > 0);
    if (active.length === 0) return;

    const data = buildPlotData(active, streams);
    const opts = buildOpts(el, active, chartConfig.colors);

    plotRef.current?.destroy();
    plotRef.current = new uPlot(opts, data, el);

    const ro = new ResizeObserver(() => {
      if (plotRef.current && el) {
        plotRef.current.setSize({ width: el.clientWidth, height: 300 });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, [streams, chartConfig.colors]);

  const hasData = STREAM_DEFS.some((d) => (streams[d.key]?.length ?? 0) > 0);

  if (!hasData) {
    return <ChartShell title="运动数据曲线" empty emptyMessage="暂无运动数据" />;
  }

  return (
    <ChartShell title="运动数据曲线">
      <div ref={chartRef} className="w-full" />
    </ChartShell>
  );
}
