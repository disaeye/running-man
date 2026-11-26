import type { ChartSummaryItem } from "@shared/ui/ChartDataSummary";
import type { ChartBars, ChartLine } from "@shared/ui/LovableChart";

export interface ChartAnnotation {
  readonly index: number;
  readonly label: string;
  readonly detail?: string;
  readonly href?: string;
  readonly tone?: "accent" | "warn" | "info";
}

const ANNOTATION_TONES = {
  accent: {
    stroke: "stroke-accent-strong/60",
    fill: "fill-accent-strong",
    dot: "bg-accent-strong",
    badge: "text-accent-strong",
  },
  warn: {
    stroke: "stroke-warn/60",
    fill: "fill-warn",
    dot: "bg-warn",
    badge: "text-warn",
  },
  info: {
    stroke: "stroke-fitness/60",
    fill: "fill-fitness",
    dot: "bg-fitness",
    badge: "text-fitness",
  },
} as const;

export function annotationToneClasses(tone: ChartAnnotation["tone"] = "accent") {
  return ANNOTATION_TONES[tone];
}

export interface ReadoutEntry {
  readonly label: string;
  readonly text: string;
  readonly deltaText: string | null;
  readonly cls: string;
}

export interface ReadoutSnapshot {
  readonly at: string;
  readonly entries: readonly ReadoutEntry[];
  readonly isBaselineDefault: boolean;
}

function firstValidValue(data: readonly (number | null)[]): number | null {
  for (const val of data) {
    if (val != null && Number.isFinite(val)) return val;
  }
  return null;
}

function lastValidPoint(
  data: readonly (number | null)[],
  labels: readonly string[],
): { index: number; value: number; at: string } | null {
  for (let i = data.length - 1; i >= 0; i -= 1) {
    const val = data[i];
    if (val != null && Number.isFinite(val)) {
      return { index: i, value: val, at: labels[i] ?? "" };
    }
  }
  return null;
}

function formatDelta(delta: number, format: (v: number) => string, invertY: boolean): string {
  if (Math.abs(delta) < 1e-6) return "较期初持平";
  const sign = delta > 0 ? "+" : "-";
  const absFormatted = format(Math.abs(delta));
  if (invertY) {
    return delta < 0 ? `较期初快 ${absFormatted}` : `较期初慢 ${absFormatted}`;
  }
  return `Δ ${sign}${absFormatted}`;
}

export function buildChartReadout(options: {
  readonly hover: number | null;
  readonly labels: readonly string[] | undefined;
  readonly lines: readonly ChartLine[];
  readonly bars?: ChartBars;
  readonly invertY: boolean;
}): ReadoutSnapshot | null {
  const { hover, labels, lines, bars, invertY } = options;
  if (!labels || labels.length === 0) return null;

  const series = [
    ...(bars ? [{ kind: "bar" as const, bars }] : []),
    ...lines.map((line) => ({ kind: "line" as const, line })),
  ];

  if (hover != null) {
    const entries = series
      .map((item) => {
        const data = item.kind === "bar" ? item.bars.data : item.line.data;
        const label = (item.kind === "bar" ? item.bars.label : item.line.label) ?? "";
        const format =
          (item.kind === "bar" ? item.bars.format : item.line.format) ??
          ((value: number) => value.toFixed(1));
        const value = data[hover];
        if (value == null || !label) return null;
        const firstVal = item.kind === "line" ? firstValidValue(item.line.data) : null;
        const deltaText =
          firstVal != null && hover > 0 ? formatDelta(value - firstVal, format, invertY) : null;
        return {
          label,
          text: format(value),
          deltaText,
          cls: item.kind === "bar" ? item.bars.cls : item.line.cls,
        };
      })
      .filter((entry): entry is ReadoutEntry => entry != null);
    return entries.length > 0 ? { at: labels[hover] ?? "", entries, isBaselineDefault: false } : null;
  }

  let defaultAt = labels[labels.length - 1] ?? "";
  const defaultEntries: ReadoutEntry[] = [];
  for (const line of lines) {
    if (!line.label) continue;
    const latest = lastValidPoint(line.data, labels);
    if (!latest) continue;
    defaultAt = latest.at || defaultAt;
    const format = line.format ?? ((value: number) => value.toFixed(1));
    const firstVal = firstValidValue(line.data);
    const deltaText =
      firstVal != null && latest.index > 0
        ? formatDelta(latest.value - firstVal, format, invertY)
        : null;
    defaultEntries.push({
      label: line.label,
      text: format(latest.value),
      deltaText,
      cls: line.cls,
    });
  }
  if (defaultEntries.length === 0) return null;
  return { at: `最新 ${defaultAt}`, entries: defaultEntries, isBaselineDefault: true };
}

export function buildChartSummaryItems(
  lines: readonly ChartLine[],
  labels?: readonly string[],
): ChartSummaryItem[] {
  const items: ChartSummaryItem[] = [];
  lines.forEach((line) => {
    if (!line.label) return;
    const points = line.data
      .map((value, index) => ({ value, index }))
      .filter((point): point is { value: number; index: number } => point.value != null);
    if (points.length === 0) return;
    const format = line.format ?? ((value: number) => value.toFixed(1));
    let turning: string | null = null;
    if (points.length >= 3) {
      let best = -1;
      let bestSwing = 0;
      for (let i = 1; i < points.length - 1; i++) {
        const prevDelta = points[i]!.value - points[i - 1]!.value;
        const nextDelta = points[i + 1]!.value - points[i]!.value;
        const swing = Math.abs(prevDelta) + Math.abs(nextDelta);
        const reverses = (prevDelta > 0 && nextDelta < 0) || (prevDelta < 0 && nextDelta > 0);
        if (reverses && swing > bestSwing) {
          bestSwing = swing;
          best = i;
        }
      }
      if (best > 0) {
        const at = labels?.[points[best]!.index];
        turning = `${at ? `${at} ` : ""}${format(points[best]!.value)}`;
      }
    }
    items.push({
      label: line.label,
      start: format(points[0]!.value),
      turning,
      end: format(points[points.length - 1]!.value),
      points: points.length,
    });
  });
  return items;
}

export function computeChartScale(options: {
  readonly lines: readonly ChartLine[];
  readonly bars?: ChartBars;
  readonly labels?: readonly string[];
  readonly referenceBand?: { readonly min: number; readonly max: number };
  readonly zero: boolean;
}) {
  const { lines, bars, labels, referenceBand, zero } = options;
  const lineValues = lines.flatMap((line) => line.data.filter((value): value is number => value != null));
  const hasBars = bars?.data.some((v) => v > 0) ?? false;
  const hasValues = lineValues.length > 0 || hasBars;
  const combined = referenceBand ? [...lineValues, referenceBand.min, referenceBand.max] : lineValues;
  const dataMin = combined.length > 0 ? Math.min(...combined) : 0;
  const dataMax = combined.length > 0 ? Math.max(...combined) : 1;
  const span = Math.max(dataMax - dataMin, 1e-6);
  const pad = zero ? 0 : span * 0.1;
  return {
    hasValues,
    min: zero ? Math.min(dataMin, 0) : dataMin - pad,
    max: zero ? Math.max(dataMax, 1) : dataMax + pad,
    barMax: bars ? Math.max(...bars.data, 1) : 1,
    count: Math.max(...lines.map((line) => line.data.length), bars?.data.length ?? 0, labels?.length ?? 0, 1),
  };
}

export function chartIndexFromPointer(
  clientX: number,
  rect: { readonly left: number; readonly width: number },
  labelCount: number,
  viewWidth: number,
  paddingX: number,
): number | null {
  if (labelCount <= 0) return null;
  const xView = Math.min(viewWidth - paddingX, Math.max(paddingX, ((clientX - rect.left) / rect.width) * viewWidth));
  return Math.round(((xView - paddingX) / (viewWidth - paddingX * 2)) * (labelCount - 1));
}

export function computeTickIndexes(labels: readonly string[] | undefined, ticks: number): number[] {
  if (!labels || labels.length === 0) return [];
  const step = Math.max(1, Math.ceil(labels.length / ticks));
  const indexes: number[] = [];
  for (let i = 0; i < labels.length; i += step) indexes.push(i);
  if (indexes[indexes.length - 1] !== labels.length - 1) indexes.push(labels.length - 1);
  return indexes;
}

export function buildLineRuns(
  data: readonly (number | null)[],
  x: (index: number) => number,
  y: (value: number) => number,
): string[][] {
  const runs: string[][] = [];
  let current: string[] = [];
  for (let point = 0; point < data.length; point++) {
    const value = data[point];
    if (value == null) {
      if (current.length > 1) runs.push(current);
      current = [];
      continue;
    }
    current.push(`${x(point)},${y(value)}`);
  }
  if (current.length > 1) runs.push(current);
  return runs;
}
