"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

export type ZoneTone = "safe" | "caution" | "danger" | "neutral";

export interface ZoneBand {
  min: number;
  max: number;
  tone: ZoneTone;
  label?: string;
  description?: string;
}

const TONE_FILL_CLASS: Record<ZoneTone, string> = {
  safe: "bg-zone-3",
  caution: "bg-zone-4",
  danger: "bg-zone-5",
  neutral: "bg-zone-1",
};

const TONE_VAR: Record<ZoneTone, string> = {
  safe: "var(--color-zone-3)",
  caution: "var(--color-zone-4)",
  danger: "var(--color-zone-5)",
  neutral: "var(--color-zone-1)",
};

const TONE_TEXT: Record<ZoneTone, string> = {
  safe: "text-zone-3",
  caution: "text-zone-4",
  danger: "text-zone-5",
  neutral: "text-zone-1",
};

export function toneText(tone: ZoneTone): string {
  return TONE_TEXT[tone];
}

function formatBound(v: number): string {
  if (v <= -9999) return "-∞";
  if (v >= 9999) return "+∞";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export interface ZoneScaleProps {
  zones: ZoneBand[];
  value: number | null;
  displayMin: number;
  displayMax: number;
}

export function ZoneScale({ zones, value, displayMin, displayMax }: ZoneScaleProps) {
  const range = displayMax - displayMin;
  if (range <= 0) return null;

  const pct = (v: number) => {
    const clamped = Math.min(Math.max(v, displayMin), displayMax);
    return ((clamped - displayMin) / range) * 100;
  };

  const segments = zones
    .map((z) => {
      const lo = Math.max(z.min, displayMin);
      const hi = Math.min(z.max, displayMax);
      if (hi <= lo) return null;
      return { z, left: pct(lo), width: pct(hi) - pct(lo) };
    })
    .filter((s): s is { z: ZoneBand; left: number; width: number } => s !== null);

  // Finite boundaries strictly inside the display range.
  const boundSet = new Set<number>();
  for (const z of zones) {
    if (z.min > displayMin && z.min < displayMax) boundSet.add(z.min);
    if (z.max > displayMin && z.max < displayMax) boundSet.add(z.max);
  }
  const boundaries = [...boundSet].sort((a, b) => a - b);

  const activeZone =
    value != null ? (zones.find((z) => value >= z.min && value < z.max) ?? null) : null;
  const valuePct = value != null ? pct(value) : null;

  return (
    <div className="mt-2 select-none">
      {/* current-value pointer (triangle) */}
      <div className="relative h-1.5">
        {valuePct != null && activeZone && (
          <div
            className="absolute top-0 -translate-x-1/2"
            style={{ left: `${valuePct}%` }}
            aria-hidden
          >
            <span
              className="block h-0 w-0"
              style={{
                borderLeft: "4px solid transparent",
                borderRight: "4px solid transparent",
                borderTop: `5px solid ${TONE_VAR[activeZone.tone]}`,
              }}
            />
          </div>
        )}
      </div>

      {/* thick segmented zone bar */}
      <TooltipProvider delayDuration={200}>
        <div className="relative h-2 w-full overflow-hidden rounded-full">
          <TooltipProvider delayDuration={200}>
            {segments.map((s, i) => (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <div
                    className={`absolute top-0 h-full cursor-help ${TONE_FILL_CLASS[s.z.tone]}`}
                    style={{ left: `${s.left}%`, width: `${s.width}%` }}
                    aria-label={s.z.label}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{s.z.label}</p>
                  <p className="text-caption2 text-text-muted">
                    {formatBound(s.z.min)} ~ {formatBound(s.z.max)}
                  </p>
                  {s.z.description && (
                    <p className="mt-0.5 max-w-48 text-caption2 text-text-muted">
                      {s.z.description}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
          {/* boundary ticks (crisp dividers on top of segments) */}
          {boundaries.map((b) => (
            <div
              key={b}
              className="absolute top-0 h-full w-px bg-surface"
              style={{ left: `${pct(b)}%` }}
              aria-hidden
            />
          ))}
        </div>
      </TooltipProvider>

      {/* boundary value labels */}
      <div className="relative mt-0.5 h-3">
        {boundaries.map((b) => (
          <span
            key={b}
            className="absolute -translate-x-1/2 font-mono text-caption2 text-text-muted"
            style={{ left: `${pct(b)}%` }}
          >
            {formatBound(b)}
          </span>
        ))}
      </div>
    </div>
  );
}
