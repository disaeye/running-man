import { describeAtl, describeTsb } from "@features/pmc/components/pmcSemantics";
import type { PmcPoint } from "@features/pmc/hooks/usePmcData";
import type { LocalReadiness } from "@features/today/hooks/useReadiness";
import type { WellnessPoint } from "@features/health/hooks/useWellness";

export type DriverStat = {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: "text-text-primary" | "text-recovery-good" | "text-recovery-moderate" | "text-recovery-poor";
};

export type Diagnosis = {
  readonly title: string;
  readonly detail: string;
  readonly badge: string;
  readonly variant: "success" | "error" | "neutral";
  readonly tone: "text-text-primary" | "text-recovery-good" | "text-recovery-poor";
};

type WellnessNumericKey = "resting_hr" | "hrv" | "sleep_secs" | "vo2max";

export function buildRecoveryDiagnosis(
  readiness: LocalReadiness | null,
  latestLoad: PmcPoint | null,
  sampleCount: number,
): Diagnosis {
  if (hasLoadConflict(readiness, latestLoad)) return loadConflictDiagnosis(readiness, latestLoad);
  if (isStableReadiness(readiness)) return stableDiagnosis(readiness, sampleCount);
  return pendingDiagnosis(sampleCount);
}

function hasLoadConflict(readiness: LocalReadiness | null, latestLoad: PmcPoint | null): readiness is LocalReadiness {
  return readiness != null && latestLoad != null && isReadinessLow(readiness) && isLoadHigh(latestLoad);
}

function isReadinessLow(readiness: LocalReadiness): boolean {
  return readiness.score < 50 || readiness.level === "rest" || readiness.level === "recovery";
}

function isLoadHigh(latestLoad: PmcPoint): boolean {
  const atlZone = describeAtl(latestLoad.atl);
  const tsbZone = describeTsb(latestLoad.tsb);
  return atlZone?.tone === "danger" || tsbZone?.tone === "danger" || tsbZone?.tone === "caution";
}

function isStableReadiness(readiness: LocalReadiness | null): readiness is LocalReadiness {
  return readiness != null && readiness.score >= 70;
}

function loadConflictDiagnosis(readiness: LocalReadiness, latestLoad: PmcPoint | null): Diagnosis {
  const load = latestLoad ?? { atl: 0, tsb: 0 };
  return {
    title: "恢复-负荷冲突",
    // Numbers only — UI shows title/badge; detail is for a11y/title/tests.
    detail: `Readiness ${readiness.score} · ATL ${Math.round(load.atl)} · TSB ${Math.round(load.tsb)}`,
    badge: "负荷压制",
    variant: "error",
    tone: "text-recovery-poor",
  };
}

function stableDiagnosis(readiness: LocalReadiness, sampleCount: number): Diagnosis {
  return {
    title: "恢复趋势稳定",
    detail: `Readiness ${readiness.score} · ${sampleCount} 天样本`,
    badge: "稳定",
    variant: "success",
    tone: "text-recovery-good",
  };
}

function pendingDiagnosis(sampleCount: number): Diagnosis {
  return {
    title: "恢复信号待确认",
    detail: `${sampleCount} 天样本`,
    badge: "样本不足",
    variant: "neutral",
    tone: "text-text-primary",
  };
}

export function buildRecoveryDrivers(wellness: WellnessPoint[]): DriverStat[] {
  const latestSleep = latestValue(wellness, "sleep_secs");
  const latestRhr = latestValue(wellness, "resting_hr");
  const latestHrv = latestValue(wellness, "hrv");
  const latestVo2 = latestValue(wellness, "vo2max");
  return [
    {
      label: "睡眠",
      value: latestSleep != null ? `${(latestSleep / 3600).toFixed(1)}h` : "--",
      detail: `7日均 ${formatHours(average(recentValues(wellness, "sleep_secs", 7)))}`,
      tone: latestSleep != null && latestSleep < 23_400 ? "text-recovery-poor" : "text-recovery-good",
    },
    {
      label: "RHR",
      value: latestRhr != null ? `${Math.round(latestRhr)} bpm` : "--",
      detail: `28日均 ${formatNumber(average(recentValues(wellness, "resting_hr", 28)), "bpm")}`,
      tone: "text-text-primary",
    },
    {
      label: "HRV",
      value: latestHrv != null ? `${Math.round(latestHrv)} ms` : "--",
      detail: `7日均 ${formatNumber(average(recentValues(wellness, "hrv", 7)), "ms")}`,
      tone: latestHrv != null ? "text-recovery-good" : "text-text-primary",
    },
    {
      label: "VO₂max",
      value: latestVo2 != null ? latestVo2.toFixed(1) : "--",
      detail: `90日变化 ${formatDelta(periodDelta(wellness, "vo2max"))}`,
      tone: "text-text-primary",
    },
  ];
}

function latestValue(points: WellnessPoint[], key: WellnessNumericKey): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index]?.[key];
    if (typeof value === "number") return value;
  }
  return null;
}

function recentValues(points: WellnessPoint[], key: WellnessNumericKey, days: number): number[] {
  return points.slice(-days).flatMap((point) => {
    const value = point[key];
    return typeof value === "number" ? [value] : [];
  });
}

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function periodDelta(points: WellnessPoint[], key: WellnessNumericKey): number | null {
  const values = recentValues(points, key, 90);
  const first = values[0];
  const last = values.at(-1);
  return first != null && last != null && values.length >= 2 ? last - first : null;
}

function formatHours(value: number | null): string {
  return value != null ? `${(value / 3600).toFixed(1)}h` : "--";
}

function formatNumber(value: number | null, unit: string): string {
  return value != null ? `${Math.round(value)} ${unit}` : "--";
}

function formatDelta(value: number | null): string {
  return value != null ? `${value > 0 ? "+" : ""}${value.toFixed(1)}` : "--";
}
