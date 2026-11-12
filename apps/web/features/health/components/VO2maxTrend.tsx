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
import { useWellnessHistory } from "@features/health/lib/physiology-display";
import type { WellnessPoint } from "@features/health/hooks/useWellness";

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

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

function buildOption(points: WellnessPoint[], chartConfig: ChartConfig): echarts.EChartsCoreOption {
  const c = chartConfig.colors;
  const days = points.map((p) => p.day.slice(5));
  const values = points.map((p) => p.vo2max);
  return {
    grid: { left: 40, right: 16, top: 16, bottom: 16 },
    xAxis: { data: days },
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

/** VO₂max 全历史趋势：当前值取最近一条记录并标注日期，趋势只画实际记录点。 */
export function VO2maxTrend() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartConfig = useChartConfig();
  const { profile } = useProfile();
  const sex = normalizeSex(profile?.sex);
  // 生理指标不随页面时间窗口取数：全历史中最近的记录才代表当前水平。
  const wellness = useWellnessHistory();

  const stats = useMemo(() => {
    const sorted = [...wellness].sort((a, b) => a.day.localeCompare(b.day));
    const records = sorted.filter((p) => p.vo2max != null);
    const last = records[records.length - 1] ?? null;
    const first = records[0] ?? null;
    return {
      last,
      totalDelta: last && first && last !== first ? +(last.vo2max! - first.vo2max!).toFixed(1) : null,
      firstDay: first?.day ?? null,
      series: records,
    };
  }, [wellness]);

  useECharts(containerRef, () => buildOption(stats.series, chartConfig), [stats.series, chartConfig], {
    chartConfig,
  });

  const level = vo2Level(stats.last?.vo2max ?? null, sex);
  const hasData = stats.series.length > 0;

  return (
    <Card padding="md">
      <header className="mb-4 flex items-baseline justify-between">
        <h3 className="text-caption1 font-semibold text-text-secondary">VO₂max 趋势</h3>
        {level && <Badge variant={level.variant} className="text-subheadline">有氧能力 · {level.label}</Badge>}
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Vo2Stat
          label="当前 VO₂max"
          value={stats.last?.vo2max != null ? stats.last.vo2max.toFixed(1) : "--"}
          unit="ml/kg/min"
        />
        <DeltaStat label={`自 ${stats.firstDay ?? "--"} 起变化`} delta={stats.totalDelta} />
        <div className="flex flex-col gap-1">
          <span className="text-caption1 text-text-secondary">最近记录</span>
          <span className="font-mono text-title1 font-bold text-text-primary">{stats.last?.day ?? "--"}</span>
        </div>
      </div>
      {!sex && <p className="mt-3 text-caption1 text-text-muted">未填写性别，分类按男女合并标准</p>}
      <p className="mt-2 text-caption1 text-text-muted">设备在符合强度条件的训练日生成新的 VO₂max 估算，普通日常活动不产生新记录。</p>

      <div className="relative">
        <div ref={containerRef} className="mt-4 min-h-[200px] w-full lg:h-[180px]" data-testid="vo2max-trend-chart" />
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-card">
            <EmptyState title={EMPTY_LABEL} description="记录 VO₂max 后，这里将展示有氧能力趋势" />
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
  const dot =
    delta == null ? "bg-text-muted"
      : delta > 0.5 ? "bg-recovery-good"
        : delta < -0.5 ? "bg-recovery-poor"
          : "bg-text-primary";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption1 text-text-secondary">{label}</span>
      <span className="flex items-center gap-1.5 font-mono text-title1 font-bold text-text-primary">
        <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
        {delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}` : "--"}
      </span>
      <span className="text-caption2 text-text-muted">ml/kg/min</span>
    </div>
  );
}
