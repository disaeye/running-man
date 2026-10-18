"use client";

import type { MetricKey } from "@shared/config/generated/metric-registry";
import {
  ZONE_TONE_CLASS,
  formatZoneRange,
  metricZones,
  zoneFor,
} from "@shared/lib/metric-zone";

interface ZoneMeterProps {
  readonly metricKey: MetricKey;
  readonly value: number | null | undefined;
  readonly precision?: number;
  /** Hides the band labels; the marker and colours remain. */
  readonly compact?: boolean;
  readonly className?: string;
}

interface DisplaySpan {
  readonly min: number;
  readonly max: number;
}

/**
 * Where the meter starts and ends.
 *
 * The contract's outer bands are open (`< -30`, `> +25`), so the drawing range
 * comes from the finite boundaries plus a quarter of their width on each side.
 * That keeps the marker away from the edge for values near a boundary while
 * keeping every band visible.
 */
function displaySpan(key: MetricKey): DisplaySpan {
  const bounds = metricZones(key)
    .flatMap((zone) => [zone.min, zone.max])
    .filter((value) => Number.isFinite(value));
  if (bounds.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...bounds);
  const max = Math.max(...bounds);
  const width = max - min;
  const margin = width > 0 ? width * 0.25 : 1;
  return { min: min - margin, max: max + margin };
}

function clamp(value: number, span: DisplaySpan): number {
  return Math.min(Math.max(value, span.min), span.max);
}

export function ZoneMeter({
  metricKey,
  value,
  precision = 1,
  compact = false,
  className = "",
}: ZoneMeterProps) {
  const zones = metricZones(metricKey);
  if (zones.length === 0) return null;

  const span = displaySpan(metricKey);
  const spanWidth = span.max - span.min;
  const zone = zoneFor(metricKey, value);
  const markerPercent =
    value == null
      ? null
      : ((clamp(value, span) - span.min) / spanWidth) * 100;

  const label = [
    value == null ? "暂无数值" : `当前 ${Number(value.toFixed(precision))}`,
    zone ? `${zone.label}（${formatZoneRange(zone, precision)}）` : null,
    zone?.description ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={className} role="img" aria-label={label}>
      <div className="relative flex h-1.5 w-full overflow-hidden rounded-full">
        {zones.map((entry) => {
          const low = clamp(entry.min, span);
          const high = clamp(entry.max, span);
          const width = Math.max(((high - low) / spanWidth) * 100, 0);
          if (width <= 0) return null;
          return (
            <span
              key={`${entry.label}-${entry.min}`}
              className={`${ZONE_TONE_CLASS[entry.tone].dot} opacity-40`}
              style={{ width: `${width}%` }}
            />
          );
        })}
        {markerPercent != null && (
          <span
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-card bg-text-primary"
            style={{ left: `${markerPercent}%` }}
          />
        )}
      </div>
      {!compact && (
        <div className="mt-1.5 flex justify-between gap-2 text-caption2 text-text-muted">
          <span>{Number(span.min.toFixed(precision))}</span>
          {zone && <span className={ZONE_TONE_CLASS[zone.tone].text}>{zone.label}</span>}
          <span>{Number(span.max.toFixed(precision))}</span>
        </div>
      )}
    </div>
  );
}
