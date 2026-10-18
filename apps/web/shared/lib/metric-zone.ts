import {
  METRIC_REGISTRY,
  type MetricKey,
} from "@shared/config/generated/metric-registry";

/**
 * Resolved display zones for a metric.
 *
 * `contracts/v1/metrics.yaml` defines, for every metric that has bands, the
 * boundaries, the label, the tone and a sentence explaining what that range
 * means for the athlete. `generate_data_contract.py` turns it into
 * `METRIC_REGISTRY`. This module is the only place that reads those bands, so
 * a threshold exists once in the repository and every surface — chip, chart
 * background, diagnosis sentence, glossary — resolves to the same answer.
 *
 * The contract's zones carry `min` only on the last band and `max` on the rest;
 * the missing side is filled from the neighbouring boundary.
 */
export type ZoneTone = "safe" | "caution" | "danger" | "neutral";

export interface MetricZone {
  /** Inclusive. `-Infinity` when the contract leaves the low end open. */
  readonly min: number;
  /** Exclusive. `+Infinity` when the contract leaves the high end open. */
  readonly max: number;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly tone: ZoneTone;
}

interface RegistryZone {
  readonly min?: number;
  readonly max?: number;
  readonly label: string;
  readonly tone: string;
  readonly description: string;
}

/** Compact labels for chips, chart legends and axis marks. */
const SHORT_LABELS: Readonly<Record<string, string>> = {
  过载风险: "风险",
  疲劳偏高: "疲劳",
  平衡: "平衡",
  新鲜窗口: "新鲜",
  负荷过轻: "负荷过轻",
  新手: "新手",
  中等: "中等",
  精英: "精英",
  低负荷: "低",
  中等负荷: "中等",
  高负荷: "高",
  减量风险: "减量",
  安全区: "安全",
  偏高: "偏高",
  损伤风险: "风险",
};

const TONES: ReadonlySet<string> = new Set(["safe", "caution", "danger", "neutral"]);

const cache = new Map<MetricKey, readonly MetricZone[]>();

function rawZones(key: MetricKey): readonly RegistryZone[] {
  const definition = METRIC_REGISTRY[key] as { zones?: readonly RegistryZone[] };
  return definition.zones ?? [];
}

/** Every metric that carries bands in the contract. */
export function hasZones(key: MetricKey): boolean {
  return rawZones(key).length > 0;
}

export function metricZones(key: MetricKey): readonly MetricZone[] {
  const cached = cache.get(key);
  if (cached) return cached;

  let previousMax = Number.NEGATIVE_INFINITY;
  const zones = rawZones(key).map((zone) => {
    const max = zone.max ?? Number.POSITIVE_INFINITY;
    const min = zone.min ?? previousMax;
    previousMax = max;
    return {
      min,
      max,
      label: zone.label,
      shortLabel: SHORT_LABELS[zone.label] ?? zone.label,
      description: zone.description,
      tone: (TONES.has(zone.tone) ? zone.tone : "neutral") as ZoneTone,
    };
  });
  cache.set(key, zones);
  return zones;
}

/** The band a value falls in, or `null` when there is no value to place. */
export function zoneFor(
  key: MetricKey,
  value: number | null | undefined,
): MetricZone | null {
  if (value == null || !Number.isFinite(value)) return null;
  return metricZones(key).find((zone) => value >= zone.min && value < zone.max) ?? null;
}

/** `安全区 0.8–1.3`, with the open ends written as `< 0.8` and `> 1.5`. */
export function formatZoneRange(zone: MetricZone, precision = 1): string {
  const format = (value: number) => Number(value.toFixed(precision)).toString();
  if (zone.min === Number.NEGATIVE_INFINITY) return `< ${format(zone.max)}`;
  if (zone.max === Number.POSITIVE_INFINITY) return `> ${format(zone.min)}`;
  // A hyphen between two negative numbers reads as a minus sign; spell it out.
  const separator = zone.min < 0 || zone.max < 0 ? " 到 " : "–";
  return `${format(zone.min)}${separator}${format(zone.max)}`;
}

/** One-line band summary for glossaries: `减量风险 < 0.8 · 安全区 0.8–1.3 · …`. */
export function zoneReference(key: MetricKey, precision = 1): string {
  return metricZones(key)
    .map((zone) => `${zone.label} ${formatZoneRange(zone, precision)}`)
    .join(" · ");
}

/** Tailwind classes per tone. The only place a zone tone becomes a colour. */
export const ZONE_TONE_CLASS: Readonly<
  Record<ZoneTone, { readonly text: string; readonly surface: string; readonly dot: string }>
> = {
  safe: {
    text: "text-recovery-good",
    surface: "bg-recovery-good/10",
    dot: "bg-recovery-good",
  },
  caution: {
    text: "text-recovery-moderate",
    surface: "bg-recovery-moderate/10",
    dot: "bg-recovery-moderate",
  },
  danger: {
    text: "text-recovery-poor",
    surface: "bg-recovery-poor/10",
    dot: "bg-recovery-poor",
  },
  neutral: {
    text: "text-text-secondary",
    surface: "bg-surface-overlay",
    dot: "bg-text-muted",
  },
};
