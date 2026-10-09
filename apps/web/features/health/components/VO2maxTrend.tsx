"use client";

import { useRef, useMemo } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, MarkLineComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useChartConfig, type ChartConfig } from "@shared/hooks/useChartConfig";
import { useECharts } from "@shared/hooks/useECharts";
import { useProfile } from "@features/settings/hooks/useProfile";
import { Card } from "@shared/ui/Card";
import { Badge } from "@shared/ui/Badge";
import { EmptyState } from "@shared/ui/EmptyState";
import { EMPTY_LABEL } from "@shared/lib/use-data-state";
import type { WellnessPoint } from "@features/health/hooks/useWellness";

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

interface VO2maxTrendProps {
  data: WellnessPoint[];
}

/**
 * Map a VO₂max value + athlete sex to an aerobic capacity descriptor.
 * Bands follow ACSM fitness categories with a mixed-sex fallback.
 */
type Sex = "male" | "female";

function normalizeSex(value: string | null | undefined): Sex | null {
  if (value === "male" || value === "M") return "male";
  if (value === "female" || value === "F") return "female";
  return null;
}

function vo2Level(value: number | null, sex: Sex | null): { label: string; variant: "success" | "info" | "warning" | "neutral" } | null {
  if (value == null) return null;
  const adjustment = sex === "female" ? -10 : 0;
  if (value >= 55 + adjustment) return { label: "精英", variant: "success" };
  if (value >= 49 + adjustment) return { label: "优秀", variant: "success" };
  if (value >= 43 + adjustment) return { label: "良好", variant: "info" };
  if (value >= 35 + adjustment) return { label: "一般", variant: "warning" };
  return { label: "需提升", variant: "neutral" };
}

/** Difference between first and last non-null vo2max in the window. */
function periodDelta(points: WellnessPoint[]): number | null {
  const values = points
    .filter((p) => p.vo2max != null)
    .map((p) => p.vo2max as number);
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (first == null || last == null) return null;
  return +(last - first).toFixed(1);
}

function buildOption(points: WellnessPoint[], chartConfig: ChartConfig): echarts.EChartsCoreOption {
  const c = chartConfig.colors;
  const days = points.map((p) => p.day.slice(5));
  const values = points.map((p) => p.vo2max);
  return {
    grid: { left: 40, right: 16, top: 16, bottom: 16 },
    xAxis: {
      data: days,
    },
    yAxis: {
      name: "ml/kg/min",
      nameTextStyle: { color: c.textMuted, fontSize: 10 },
      scale: true,
    },
    series: [
      {
        name: "VO₂max",
        type: "line",
        data: values,
        smooth: true,
        showSymbol: true,
        symbolSize: 4,
        lineStyle: { width: 2, color: c.accent },
        itemStyle: { color: c.accent },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: c.textMuted, type: "dashed", width: 1, opacity: 0.4 },
          data: [{ type: "average", label: { color: c.textMuted, fontSize: 10, formatter: "均值 {c}" } }],
        },
      },
    ],
  };
}

/**
 * VO₂max trend card: latest value, 30-day change, 90-day change,
 * and an aerobic capacity level badge based on ACSM fitness categories.
 */
export function VO2maxTrend({ data }: VO2maxTrendProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartConfig = useChartConfig();
  const { profile } = useProfile();
  const sex = normalizeSex(profile?.sex);

  const stats = useMemo(() => {
    const sorted = [...data].sort((a, b) => a.day.localeCompare(b.day));
    const last = [...sorted].reverse().find((p) => p.vo2max != null);
    const last30 = sorted.slice(-30);
    const last90 = sorted.slice(-90);
    return {
      last,
      delta30: periodDelta(last30),
      delta90: periodDelta(last90),
      series: sorted.slice(-90).filter((p) => p.vo2max != null || true),
    };
  }, [data]);

  useECharts(containerRef, () => buildOption(stats.series, chartConfig), [stats.series, chartConfig], {
    chartConfig,
  });

  const level = vo2Level(stats.last?.vo2max ?? null, sex);
  const hasData = stats.series.some((p) => p.vo2max != null);

  return (
    <Card padding="md">
      <header className="mb-4 flex items-baseline justify-between">
        <h3 className="text-subheadline font-semibold uppercase tracking-wider text-text-muted">
          VO₂max 趋势
        </h3>
        {level && (
          <Badge variant={level.variant} className="text-subheadline">
            有氧能力 · {level.label}
          </Badge>
        )}
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Vo2Stat
          label="当前 VO₂max"
          value={stats.last?.vo2max != null ? `${stats.last.vo2max.toFixed(1)}` : "--"}
          unit="ml/kg/min"
        />
        <DeltaStat label="30日变化" delta={stats.delta30} />
        <DeltaStat label="90日变化" delta={stats.delta90} />
      </div>
      {!sex && (
        <p className="mt-3 text-caption1 text-text-muted">分类基于混合性别标准</p>
      )}

      <div className="relative">
        <div ref={containerRef} className="mt-4 min-h-[200px] w-full lg:h-[180px]" data-testid="vo2max-trend-chart" />
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-card">
            <EmptyState
              title={EMPTY_LABEL}
              description="记录 VO₂max 后，这里将展示有氧能力趋势"
            />
          </div>
        )}
      </div>
    </Card>
  );
}

function Vo2Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption1 text-text-secondary">{label}</span>
      <span className="font-mono text-title1 font-bold text-accent-strong">
        {value}
        {unit && <span className="ml-1 text-caption2 font-normal text-text-muted">{unit}</span>}
      </span>
    </div>
  );
}

function DeltaStat({ label, delta }: { label: string; delta: number | null }) {
  const tone =
    delta == null
      ? "text-text-muted"
      : delta > 0.5
        ? "text-recovery-good"
        : delta < -0.5
          ? "text-recovery-poor"
          : "text-text-primary";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption1 text-text-secondary">{label}</span>
      <span className={`font-mono text-title1 font-bold ${tone}`}>
        {delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}` : "--"}
      </span>
      <span className="text-caption2 text-text-muted">ml/kg/min</span>
    </div>
  );
}
