import type { IntensityPoint } from "@features/performance/components/PerformanceIntensity";

export const ZONE_DETAILS = [
  { shortName: "Z1", name: "Z1 恢复", effort: "轻松跑" },
  { shortName: "Z2", name: "Z2 有氧", effort: "轻松有氧" },
  { shortName: "Z3", name: "Z3 节奏", effort: "中等节奏" },
  { shortName: "Z4", name: "Z4 阈值", effort: "阈值跑" },
  { shortName: "Z5", name: "Z5 极限", effort: "快速跑" },

] as const;

export const EMPTY_INTENSITY_GUIDANCE =
  "先补齐跑步心率、配速和阈值数据来建立区间。";

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
  return zoneLine(breakdown.percentages);
}

function zoneLine(percentages: readonly number[]): string {
  return `Z1 ${percentages[0]}% · Z2 ${percentages[1]}% · Z3 ${percentages[2]}% · Z4 ${percentages[3]}% · Z5 ${percentages[4]}%`;
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
