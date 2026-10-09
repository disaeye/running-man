"use client";

import { useRef, useEffect, useState } from "react";
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
import { OKABE_ITO } from "@shared/lib/chart-tokens";
import { Card } from "@shared/ui/Card";
import { EmptyState } from "@shared/ui/EmptyState";
import { EMPTY_LABEL, LOADING_LABEL } from "@shared/lib/use-data-state";
import { apiFetch } from "@shared/lib/api";
import { computeRange, formatDate } from "@shared/lib/format";

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

interface AbilityPoint {
  date: string;
  vo2max: number | null;
  avgPace: number | null;
}

interface WellnessAbilityPoint {
  day: string;
  vo2max?: number | null;
}

function buildOption(data: AbilityPoint[], chartConfig: ChartConfig): echarts.EChartsCoreOption {
  const c = chartConfig.colors;
  const dates = data.map((d) => formatDate(d.date));
  return {
    legend: {
      data: ["VO₂max", "平均配速"],
    },
    grid: { right: 48, bottom: 16 },
    xAxis: {
      data: dates,
    },
    yAxis: [
      {
        name: "VO₂max",
        nameTextStyle: { color: c.textMuted },
      },
      {
        type: "value",
        name: "配速 (min/km)",
        nameTextStyle: { color: c.textMuted },
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: { color: c.textMuted, fontSize: 11 },
        inverse: true,
        min: 3,
        max: 9,
      },
    ],
    series: [
      {
        name: "VO₂max",
        type: "line",
        data: data.map((d) => d.vo2max),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: OKABE_ITO[0] },
        itemStyle: { color: OKABE_ITO[0] },
      },
      {
        name: "平均配速",
        type: "line",
        yAxisIndex: 1,
        data: data.map((d) => d.avgPace),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: OKABE_ITO[1], type: "dashed" },
        itemStyle: { color: OKABE_ITO[1] },
      },
    ],
  };
}

/**
 * Tab 2: 能力趋势
 * Shows VO₂max and average pace over time on a dual-axis line chart.
 */
export function PerformanceAbility() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartConfig = useChartConfig();
  const [data, setData] = useState<AbilityPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useECharts(containerRef, () => buildOption(data, chartConfig), [data, chartConfig], {
    chartConfig,
  });

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchAbilityData()
      .then((rows) => {
        if (!cancelled) setData(rows.filter(hasAnyAbilityValue));
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to fetch ability data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-3 text-subheadline font-semibold uppercase tracking-wider text-text-muted">
          能力指标趋势
        </h2>
        <Card padding="none" className="min-h-[200px] lg:h-[340px]">
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
              description="系统会根据你的训练记录持续追踪 VO₂max 与配速变化"
            />
          )}
          {!loading && !error && data.length > 0 && (
            <div ref={containerRef} className="h-full w-full" data-testid="ability-chart" />
          )}
        </Card>
      </section>
    </div>
  );
}

async function fetchAbilityData(): Promise<AbilityPoint[]> {
  const range = computeRange(365);
  // No FTP series: this deployment is running-only and the endpoint that
  // served FTP history no longer exists, so the request returned 404 on every
  // visit to the analysis page. The `.catch(() => [])` around it meant the
  // chart still drew, which is how it went unnoticed — the only symptom was a
  // failed request in the network log.
  const [abilityRaw, wellness] = await Promise.all([
    apiFetch<unknown>("/insights/ability").catch(() => []),
    apiFetch<WellnessAbilityPoint[]>("/wellness", { params: { from: range.from, to: range.to } }).catch(() => []),
  ]);
  // Backend may return a list of points or a single snapshot object.
  const abilityList: AbilityPoint[] = Array.isArray(abilityRaw)
    ? (abilityRaw as AbilityPoint[])
    : abilityRaw && typeof abilityRaw === "object"
      ? [
          {
            date: new Date().toISOString().slice(0, 10),
            vo2max:
              typeof (abilityRaw as { vdot?: number }).vdot === "number"
                ? (abilityRaw as { vdot: number }).vdot
                : null,
            avgPace:
              typeof (abilityRaw as { threshold_pace_s_per_km?: number }).threshold_pace_s_per_km ===
              "number"
                ? (abilityRaw as { threshold_pace_s_per_km: number }).threshold_pace_s_per_km
                : typeof (abilityRaw as { avgPace?: number }).avgPace === "number"
                  ? (abilityRaw as { avgPace: number }).avgPace
                  : null,
          },
        ]
      : [];
  const byDate = new Map<string, AbilityPoint>();
  for (const row of abilityList) byDate.set(row.date, normalizeAbility(row));
  for (const row of wellness) {
    const existing = byDate.get(row.day) ?? { date: row.day, vo2max: null, avgPace: null };
    byDate.set(row.day, { ...existing, vo2max: row.vo2max ?? existing.vo2max });
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeAbility(row: AbilityPoint): AbilityPoint {
  return {
    date: row.date,
    vo2max: row.vo2max ?? null,
    avgPace: row.avgPace ?? null,
  };
}

function hasAnyAbilityValue(row: AbilityPoint): boolean {
  return row.vo2max != null || row.avgPace != null;
}
