import type { LocalReadiness } from "@features/today/hooks/useReadiness";
import type { WellnessPoint } from "@features/health/hooks/useWellness";
import type { DatedValue } from "@features/health/lib/physiology-display";
import { HEART_RATE_UNIT } from "@shared/config/terms";

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
  sampleCount: number,
): Diagnosis {
  if (readiness != null && readiness.data_sufficient && readiness.score >= 70) {
    return stableDiagnosis(readiness, sampleCount);
  }
  return pendingDiagnosis(sampleCount);
}

function stableDiagnosis(readiness: LocalReadiness, sampleCount: number): Diagnosis {
  return {
    title: "当前恢复评分",
    detail: `恢复评分 ${readiness.score} · ${sampleCount} 天健康记录`,
    badge: "已计算",
    variant: "success",
    tone: "text-recovery-good",
  };
}

function pendingDiagnosis(sampleCount: number): Diagnosis {
  return {
    title: "恢复记录",
    detail: `${sampleCount} 天有健康数据` ,
    badge: sampleCount > 0 ? "持续观察" : "暂无记录",
    variant: "neutral",
    tone: "text-text-primary",
  };
}

export function buildRecoveryDrivers(
  wellness: WellnessPoint[],
  vo2Record: DatedValue | null,
): DriverStat[] {
  const latestSleep = latestValue(wellness, "sleep_secs");
  const latestRhr = latestValue(wellness, "resting_hr");
  const latestHrv = latestValue(wellness, "hrv");
  // vo2max 是人的生理指标，由统一的全历史当前读数提供。
  return [
    {
      label: "睡眠",
      value: latestSleep != null ? `${(latestSleep / 3600).toFixed(1)}h` : "--",
      detail: `7日均 ${formatHours(average(recentValues(wellness, "sleep_secs", 7)))}`,
      tone: latestSleep != null && latestSleep < 23_400 ? "text-recovery-poor" : "text-recovery-good",
    },
    {
      label: "RHR",
      value: latestRhr != null ? `${Math.round(latestRhr)} ${HEART_RATE_UNIT}` : "--",
      detail: `28日均 ${formatNumber(average(recentValues(wellness, "resting_hr", 28)), HEART_RATE_UNIT)}`,
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
      value: vo2Record != null ? vo2Record.value.toFixed(1) : "--",
      detail: vo2Record != null ? `记录于 ${vo2Record.day}` : "--",
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

function formatHours(value: number | null): string {
  return value != null ? `${(value / 3600).toFixed(1)}h` : "--";
}

function formatNumber(value: number | null, unit: string): string {
  return value != null ? `${Math.round(value)} ${unit}` : "--";
}
