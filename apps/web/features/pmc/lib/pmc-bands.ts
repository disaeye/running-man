import { metricZones, type ZoneTone } from "@shared/lib/metric-zone";

export type TsbBandTone = "error" | "warning" | "accent" | "success";

export interface TsbBand {
  readonly label: string;
  readonly shortLabel: string;
  readonly min: number;
  readonly max: number;
  readonly tone: TsbBandTone;
  readonly opacity: number;
}

/**
 * The chart background bands behind the TSB line.
 *
 * Boundaries and labels come from `contracts/v1/metrics.yaml` through
 * `metricZones("tsb")`; only the drawing range and opacity are decided here.
 * The chart's bands and the chip beside it therefore cannot disagree about
 * where the fresh window begins.
 */
const TONE: Readonly<Record<ZoneTone, TsbBandTone>> = {
  danger: "error",
  caution: "warning",
  safe: "success",
  neutral: "accent",
};

/** The visible vertical span of the TSB chart. */
const SPAN_MIN = -50;
const SPAN_MAX = 50;

export function getTsbBands(isDark: boolean): readonly TsbBand[] {
  const softOpacity = isDark ? 0.14 : 0.1;
  const quietOpacity = isDark ? 0.1 : 0.06;

  return metricZones("tsb").map((zone) => {
    const min = Math.max(zone.min, SPAN_MIN);
    const max = Math.min(zone.max, SPAN_MAX);
    return {
      label: zone.label,
      shortLabel: `${zone.shortLabel} ${formatBoundary(zone)}`,
      min,
      max,
      tone: TONE[zone.tone],
      // The sustainable band is the backdrop, not a warning.
      opacity: zone.tone === "safe" ? quietOpacity : softOpacity,
    };
  });
}

function formatBoundary(zone: { min: number; max: number }): string {
  const low = zone.min === Number.NEGATIVE_INFINITY ? "" : format(zone.min);
  const high = zone.max === Number.POSITIVE_INFINITY ? "" : format(zone.max);
  if (!low) return `< ${high}`;
  if (!high) return `> ${low}`;
  return `${low} 至 ${high}`;
}

function format(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}
