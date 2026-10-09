import { METRIC_REGISTRY } from "@shared/config/generated/metric-registry";

export type PmcChartFocus = "full" | "balance";

/**
 * A semantic PMC zone — label, tone, and description for a numeric range.
 * Sourced from the generated metric registry (contracts/v1/metrics.yaml).
 */
export type PmcZone = {
  readonly min: number;
  readonly max: number;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly tone: "safe" | "caution" | "danger" | "neutral";
};

/**
 * Abbreviated labels for compact display contexts (chart legends, chip rows).
 * Falls back to the full label when no abbreviation is defined.
 */
const SHORT_LABELS: Record<string, string> = {
  "过载风险": "风险",
  "疲劳偏高": "疲劳",
  "平衡": "平衡",
  "新鲜窗口": "新鲜",
  "负荷过轻": "负荷过轻",
  "新手": "新手",
  "中等": "中等",
  "精英": "精英",
  "低负荷": "低",
  "中等负荷": "中等",
  "高负荷": "高",
  "减量风险": "减量",
  "安全区": "安全",
  "偏高": "偏高",
  "损伤风险": "风险",
};

/**
 * Converts the registry zone format (optional min/max per zone) into
 * the PmcZone format (explicit min/max, with Infinity for open-ended ranges).
 */
function registryToZones(
  registryZones: readonly { min?: number; max?: number; label: string; tone: string; description: string }[],
): readonly PmcZone[] {
  let prevMax = Number.NEGATIVE_INFINITY;
  return registryZones.map((zone) => {
    const max = zone.max ?? Number.POSITIVE_INFINITY;
    const min = zone.min ?? prevMax;
    prevMax = max;
    return {
      min,
      max,
      label: zone.label,
      shortLabel: SHORT_LABELS[zone.label] ?? zone.label,
      description: zone.description,
      tone: zone.tone as PmcZone["tone"],
    };
  });
}

export const TSB_ZONES: readonly PmcZone[] = registryToZones(METRIC_REGISTRY.tsb.zones);
export const CTL_ZONES: readonly PmcZone[] = registryToZones(METRIC_REGISTRY.ctl.zones);
export const ATL_ZONES: readonly PmcZone[] = registryToZones(METRIC_REGISTRY.atl.zones);
export const ACWR_ZONES: readonly PmcZone[] = registryToZones(METRIC_REGISTRY.acwr.zones);

function findZone(zones: readonly PmcZone[], value: number | undefined): PmcZone | null {
  if (value === undefined) return null;
  return zones.find((z) => value >= z.min && value < z.max) ?? null;
}

export function describeTsb(value: number | undefined): PmcZone | null {
  return findZone(TSB_ZONES, value);
}

export function describeCtl(value: number | undefined): PmcZone | null {
  return findZone(CTL_ZONES, value);
}

export function describeAtl(value: number | undefined): PmcZone | null {
  return findZone(ATL_ZONES, value);
}

export function describeAcwr(value: number | undefined): PmcZone | null {
  return findZone(ACWR_ZONES, value);
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
