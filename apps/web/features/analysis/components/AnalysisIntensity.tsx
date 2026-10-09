"use client";

import { useMemo, useRef } from "react";
import type { EChartsCoreOption } from "echarts/core";
import "@shared/lib/echarts-setup";
import { useChartConfig, type ChartConfig } from "@shared/hooks/useChartConfig";
import { useECharts } from "@shared/hooks/useECharts";
import { useIntensityDistribution } from "@features/performance/hooks/useIntensityDistribution";
import { LOADING_LABEL } from "@shared/lib/use-data-state";
import type { IntensityPoint } from "@features/performance/components/PerformanceIntensity";
import { Card } from "@shared/ui/Card";
import { EmptyState } from "@shared/ui/EmptyState";
import { Badge } from "@shared/ui/Badge";
import { ChartShell } from "@shared/ui/ChartShell";
import { SectionHeader } from "@shared/ui/SectionHeader";
import { IntensityDistributionChart } from "@features/trends/components/IntensityDistributionChart";
import { PerformanceConsistency } from "@features/performance/components/PerformanceConsistency";
import {
  EMPTY_INTENSITY_GUIDANCE,
  buildZoneShares,
  classifyIntensity,
  summarizeIntensityDistribution,
  type IntensityClassification,
} from "@features/analysis/lib/intensity-analysis-copy";
import { useAnalysisRange } from "../lib/analysis-range";

type ZoneShare = {
  readonly name: string;
  readonly value: number;
  readonly minutes: number;
};

function classificationBadgeVariant(
  type: IntensityClassification,
): "success" | "warning" | "error" | "info" | "neutral" {
  switch (type) {
    case "polarized":
      return "success";
    case "pyramidal":
      return "info";
    case "threshold":
      return "warning";
    case "high-volume":
      return "error";
    default:
      return "neutral";
  }
}

function IntensitySummary({
  from,
  to,
}: {
  readonly from: string;
  readonly to: string;
}) {
  const { data } = useIntensityDistribution(from, to);
  const text = useMemo(() => summarizeIntensityDistribution(data), [data]);
  const classification = useMemo(() => classifyIntensity(data), [data]);
  const shares = useMemo(() => buildZoneShares(data), [data]);
  if (!text && !classification) return null;
  return (
    <Card padding="md" data-testid="analysis-intensity-summary-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-title3 font-semibold text-text-primary">强度结构</h3>
        {classification ? (
          <Badge
            variant={classificationBadgeVariant(classification.type)}
            data-testid="intensity-classification-badge"
          >
            {classification.label}
          </Badge>
        ) : null}
      </div>
      {shares.length > 0 && (
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
          {shares.map((zone, index) => (
            <div
              key={zone.name}
              className="h-full"
              style={{
                width: `${Math.max(zone.value, 0)}%`,
                background: `var(--color-zone-${index + 1})`,
              }}
              title={`${zone.name} ${zone.value}%`}
            />
          ))}
        </div>
      )}
      {shares.length > 0 && (
        <ul className="mt-3 grid grid-cols-5 gap-1">
          {shares.map((zone, index) => (
            <li key={zone.name} className="flex flex-col items-center gap-0.5 text-center">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: `var(--color-zone-${index + 1})` }}
              />
              <span className="font-mono text-caption2 tabular-nums text-text-primary">
                {zone.value}%
              </span>
              <span className="text-caption2 text-text-muted">Z{index + 1}</span>
            </li>
          ))}
        </ul>
      )}
      {/* Contract/a11y copy — not the visual lead */}
      <p className="sr-only" data-testid="analysis-intensity-summary">
        {text}
      </p>
    </Card>
  );
}

export function AnalysisIntensity() {
  const { range } = useAnalysisRange();
  return (
    <div className="flex flex-col gap-4">
      <IntensitySummary from={range.from} to={range.to} />

      <ChartShell title="周强度分布" subtitle="分钟 / 周">
        <div className="h-[340px]">
          <IntensityDistributionChart from={range.from} to={range.to} />
        </div>
      </ChartShell>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ZoneDonutCard from={range.from} to={range.to} />
        <Card padding="md" className="min-h-[280px]">
          <SectionHeader title="一致性" />
          <div className="mt-4">
            <PerformanceConsistency />
          </div>
        </Card>
      </div>
    </div>
  );
}

function ZoneDonutCard({
  from,
  to,
}: {
  readonly from: string;
  readonly to: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartConfig = useChartConfig();
  const { data, loading, error } = useIntensityDistribution(from, to);

  const zoneShares = useMemo(() => buildZoneShares(data), [data]);

  useECharts(
    containerRef,
    () => buildDonutOption(zoneShares, chartConfig),
    [zoneShares, chartConfig, data],
    { chartConfig },
  );

  return (
    <Card padding="md" className="min-h-[320px]">
      <SectionHeader title="区间分布（累计）" subtitle="各区间时长占比" />
      <div className="mt-4 min-h-0 flex-1">
        {error ? (
          <div className="flex h-64 items-center justify-center text-subheadline text-error">
            {error}
          </div>
        ) : loading && zoneShares.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-subheadline text-text-muted">
            {LOADING_LABEL}
          </div>
        ) : zoneShares.length === 0 ? (
          <div
            className="flex h-64 items-center justify-center"
            data-testid="zone-donut-empty"
          >
            <EmptyState
              title="暂无强度分布数据"
              description={EMPTY_INTENSITY_GUIDANCE}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div
              ref={containerRef}
              className="min-h-[200px] flex-1"
              data-testid="zone-donut"
            />
            <ul className="mt-3 grid grid-cols-2 gap-2 text-caption1 text-text-secondary sm:grid-cols-5">
              {zoneShares.map((zone) => (
                <li
                  key={zone.name}
                  className="rounded-lg bg-surface-overlay/55 px-2 py-1.5 font-mono tabular-nums"
                >
                  {zone.name}: {zone.minutes}min ({zone.value}%)
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function buildDonutOption(
  shares: readonly ZoneShare[],
  chartConfig: ChartConfig,
): EChartsCoreOption {
  const colors = [
    chartConfig.colors.zone1,
    chartConfig.colors.zone2,
    chartConfig.colors.zone3,
    chartConfig.colors.zone4,
    chartConfig.colors.zone5,
  ];
  return {
    tooltip: {
      trigger: "item",
      formatter: (params: unknown) => {
        const p = params as { name: string; percent: number };
        const row = shares.find((s) => s.name === p.name);
        return `${p.name}<br/>${row?.minutes ?? 0} min · ${p.percent}%`;
      },
    },
    series: [
      {
        type: "pie",
        radius: ["48%", "72%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 6,
          borderColor: chartConfig.colors.surfaceCard,
          borderWidth: 2,
        },
        label: { show: false },
        data: shares.map((s, i) => ({
          name: s.name,
          value: s.value,
          itemStyle: { color: colors[i % colors.length] },
        })),
      },
    ],
  };
}

// Keep IntensityPoint import reachable for type continuity if re-exported later.
export type { IntensityPoint };
