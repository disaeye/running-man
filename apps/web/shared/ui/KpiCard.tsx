"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card } from "./Card";
import { Sparkline } from "./Sparkline";
import { ZoneScale, type ZoneBand } from "./ZoneScale";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";
import { MetricInlineDisclosure } from "./MetricInlineDisclosure";
import {
  termLabel,
  termExplain,
  type TermExplanation,
  TERMS,
} from "@shared/config/terms";

type Trend = "up" | "down" | "stable";

const TREND_ICON: Record<Trend, typeof ArrowUp> = {
  up: ArrowUp,
  down: ArrowDown,
  stable: Minus,
};

function trendBgClass(color: string): string {
  if (color.includes("success")) return "bg-success/15";
  if (color.includes("error")) return "bg-error/15";
  if (color.includes("warning")) return "bg-warning/15";
  return "bg-surface-overlay";
}

function TrendBadge({ trend, color }: { trend: Trend; color: string }) {
  const Icon = TREND_ICON[trend];
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-caption2 font-semibold ${trendBgClass(color)} ${color}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
    </span>
  );
}

export interface KpiCardProps {
  /** Resolve label + explanation from the shared TERMS registry; wins over `label`/`explanation`. */
  termKey?: keyof typeof TERMS;
  label?: string;
  value: string;
  unit?: string;
  explanation?: TermExplanation;
  tooltip?: string;
  trend?: Trend;
  trendColor?: string;
  color?: string;
  zoneLabel?: string;
  zoneColor?: string;
  sparklineData?: number[];
  sparklineColor?: string;
  sparklineVariant?: "area" | "line";
  zones?: ZoneBand[];
  displayMin?: number;
  displayMax?: number;
  markerValue?: number | null;
  className?: string;
}

export function KpiCard({
  termKey,
  label,
  value,
  unit,
  explanation,
  tooltip,
  trend,
  trendColor: trendColorProp,
  color = "text-text-primary",
  zoneLabel,
  zoneColor = "text-text-muted",
  sparklineData,
  sparklineColor = "var(--color-chart-accent)",
  sparklineVariant = "area",
  zones,
  displayMin,
  displayMax,
  markerValue,
  className = "",
}: KpiCardProps) {
  const resolvedLabel = termKey ? termLabel(termKey) : (label ?? "");
  const resolvedExplanation = termKey ? termExplain(termKey) : explanation;
  const tColor =
    trendColorProp ??
    (trend === "up"
      ? "text-success"
      : trend === "down"
        ? "text-error"
        : "text-text-muted");
  const hasZoneScale =
    !!zones && zones.length > 0 && displayMin != null && displayMax != null;
  return (
    <Card padding="sm" className={`group flex min-h-[114px] flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${className}`}>
      <div className="flex min-w-0 items-start justify-between gap-1.5">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-text-secondary">
          {resolvedLabel}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {resolvedExplanation && (
            <MetricInlineDisclosure
              label={resolvedLabel}
              explanation={resolvedExplanation}
            />
          )}
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-xs text-text-muted underline decoration-dotted underline-offset-2">
                    ?
                  </span>
                </TooltipTrigger>
                <TooltipContent>{tooltip}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <div className="my-1.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <p
          className={`font-mono tabular-nums text-2xl font-bold tracking-tight transition-colors duration-150 group-hover:opacity-90 ${color}`}
        >
          {value}
        </p>
        {unit && (
          <span className="text-xs font-semibold text-text-secondary">
            {unit}
          </span>
        )}
        {trend && <TrendBadge trend={trend} color={tColor} />}
        {zoneLabel && (
          <span className={`inline-flex rounded-full bg-muted/70 px-2 py-0.5 text-caption1 font-medium backdrop-blur-xs ${zoneColor}`}>
            {zoneLabel}
          </span>
        )}
      </div>

      {sparklineData && sparklineData.length >= 2 && (
        <Sparkline
          data={sparklineData}
          variant={sparklineVariant}
          color={sparklineColor}
          height={36}
          opacity={0.7}
          className="mt-auto w-full pt-2"
        />
      )}

      {hasZoneScale && displayMin != null && displayMax != null && (
        <div className="mt-auto pt-2">
          <ZoneScale
            zones={zones!}
            value={markerValue ?? null}
            displayMin={displayMin}
            displayMax={displayMax}
          />
        </div>
      )}
    </Card>
  );
}

export function kpiTermLabel(key: keyof typeof TERMS): string {
  return termLabel(key);
}

export function kpiTermExplain(key: keyof typeof TERMS): TermExplanation {
  return termExplain(key);
}

export type { Trend as KpiTrend };
