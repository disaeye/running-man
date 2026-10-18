import {
  metricZones,
  zoneFor,
  type MetricZone,
} from "@shared/lib/metric-zone";

export type PmcChartFocus = "full" | "balance";

/**
 * A semantic PMC zone. Same shape as `MetricZone`; the bands themselves live in
 * `contracts/v1/metrics.yaml` and reach here through `@shared/lib/metric-zone`.
 */
export type PmcZone = MetricZone;

export const TSB_ZONES: readonly PmcZone[] = metricZones("tsb");
export const CTL_ZONES: readonly PmcZone[] = metricZones("ctl");
export const ATL_ZONES: readonly PmcZone[] = metricZones("atl");
export const ACWR_ZONES: readonly PmcZone[] = metricZones("acwr");

export function describeTsb(value: number | null | undefined): PmcZone | null {
  return zoneFor("tsb", value);
}

export function describeCtl(value: number | null | undefined): PmcZone | null {
  return zoneFor("ctl", value);
}

export function describeAtl(value: number | null | undefined): PmcZone | null {
  return zoneFor("atl", value);
}

export function describeAcwr(value: number | null | undefined): PmcZone | null {
  return zoneFor("acwr", value);
}

export function zoneToSegment(zone: PmcZone, color: string) {
  return {
    min: zone.min === Number.NEGATIVE_INFINITY ? -9999 : zone.min,
    max: zone.max === Number.POSITIVE_INFINITY ? 9999 : zone.max,
    color,
    label: zone.shortLabel,
    description: zone.description,
  };
}
