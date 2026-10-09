import type { IntensityPoint } from "@features/performance/components/PerformanceIntensity";

export const ZONE_DETAILS = [
  { shortName: "Z1", name: "Z1 恢复", effort: "轻松恢复" },
  { shortName: "Z2", name: "Z2 有氧", effort: "轻松有氧" },
  { shortName: "Z3", name: "Z3 节奏", effort: "中等节奏" },
  { shortName: "Z4", name: "Z4 阈值", effort: "高强度阈值" },
  { shortName: "Z5", name: "Z5 极限", effort: "高强度冲刺" },
] as const;

export const EMPTY_INTENSITY_GUIDANCE =
  "先补齐跑步心率、配速和阈值数据来建立区间；骑行或使用功率计时，再把 FTP/功率作为可选参考。";

interface ZoneBreakdown {
  readonly totals: readonly number[];
  readonly percentages: readonly number[];
  readonly minutes: readonly number[];
}

function buildZoneBreakdown(data: readonly IntensityPoint[]): ZoneBreakdown | null {
  const totals = [0, 0, 0, 0, 0];
  for (const point of data) {
    for (let index = 0; index < ZONE_DETAILS.length; index += 1) {
      totals[index] = (totals[index] ?? 0) + (point.zoneSeconds[index] ?? 0);
    }
  }
  const grandTotal = totals.reduce((total, value) => total + value, 0);
  if (grandTotal === 0) return null;
  return {
    totals,
    percentages: totals.map((value) => Math.round((value / grandTotal) * 100)),
    minutes: totals.map((value) => Math.round(value / 60)),
  };
}

export function summarizeIntensityDistribution(data: readonly IntensityPoint[]): string | null {
  const breakdown = buildZoneBreakdown(data);
  if (breakdown === null) return null;
  const percentages = breakdown.percentages;
  return `${zoneLine(percentages)} — ${intensityAdvice(zoneGroups(percentages))}`;
}

function zoneLine(percentages: readonly number[]): string {
  return `Z1 ${percentages[0]}% · Z2 ${percentages[1]}% · Z3 ${percentages[2]}% · Z4 ${percentages[3]}% · Z5 ${percentages[4]}%`;
}

function zoneGroups(percentages: readonly number[]) {
  const z2 = percentages[1] ?? 0;
  return {
    z2,
    easy: (percentages[0] ?? 0) + z2,
    moderate: percentages[2] ?? 0,
    hard: (percentages[3] ?? 0) + (percentages[4] ?? 0),
  };
}

function intensityAdvice(groups: ReturnType<typeof zoneGroups>): string {
  // Short labels only — structure is shown by the zone bar, not coaching prose.
  if (groups.hard >= 30) return "Z4-Z5 高强度占比偏高 · 恢复日";
  if (groups.easy >= 75 && groups.hard >= 15) return "两极分化 · 轻松+质量";
  if (groups.z2 >= 50 && groups.easy >= 70) return "Z2 有氧占比最高 · 金字塔 · 恢复压力低";
  if (groups.moderate >= 30) return "Z3 偏多 · 灰区风险";
  return "分布均衡";
}

export type IntensityClassification = "polarized" | "pyramidal" | "threshold" | "high-volume";

export interface IntensityClassificationResult {
  readonly type: IntensityClassification;
  readonly label: string;
}

const CLASSIFICATION_LABELS: Record<IntensityClassification, string> = {
  polarized: "两极分化",
  pyramidal: "金字塔型",
  threshold: "阈值型",
  "high-volume": "高负荷型",
};

export function classifyIntensity(data: readonly IntensityPoint[]): IntensityClassificationResult | null {
  const breakdown = buildZoneBreakdown(data);
  if (breakdown === null) return null;
  const groups = zoneGroups(breakdown.percentages);
  let type: IntensityClassification;
  if (groups.hard >= 30) type = "high-volume";
  else if (groups.easy >= 60 && groups.hard >= 15 && groups.moderate < 15) type = "polarized";
  else if (groups.z2 >= 50 && groups.easy >= 70) type = "pyramidal";
  else if (groups.moderate >= 30) type = "threshold";
  else type = "pyramidal";
  return { type, label: CLASSIFICATION_LABELS[type] };
}

export function buildZoneShares(data: readonly IntensityPoint[]) {
  const breakdown = buildZoneBreakdown(data);
  if (breakdown === null) return [];
  return ZONE_DETAILS.map((zone, index) => ({
    name: zone.name,
    value: Math.round((breakdown.percentages[index] ?? 0) * 10) / 10,
    minutes: breakdown.minutes[index] ?? 0,
  }));
}
