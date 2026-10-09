import { describeTsb, type PmcZone } from "@features/pmc/components/pmcSemantics";
import type { PmcPoint } from "@features/pmc/hooks/usePmcData";
import type { WeekProgress } from "@features/today/hooks/useWeeklyProgress";

export interface LoadDiagnosisCard {
  readonly testId: string;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: "accent" | "success" | "warning" | "error";
}

export interface LoadDiagnosis {
  readonly headline: string;
  readonly cards: readonly LoadDiagnosisCard[];
  readonly plannedActual: LoadDiagnosisCard;
}

const EMPTY_WEEK_CARD: LoadDiagnosisCard = {
  testId: "load-planned-actual-diagnosis",
  label: "计划对照",
  value: "待接入",
  detail: "计划对照 --",
  tone: "accent",
};

export function buildLoadDiagnosis(
  data: readonly PmcPoint[],
  weeks: readonly WeekProgress[],
): LoadDiagnosis | null {
  const latest = data.at(-1) ?? null;
  if (latest == null) return null;
  const rampCard = buildRampCard(data, latest);
  const tssCard = buildTssTrendCard(data);
  const acwrCard = buildAcwrCard(latest.acwr);
  const tsbCard = buildTsbCard(latest.tsb);
  return {
    headline: `${rampCard.value} · ${tssCard.value} · ${acwrCard.value} · ${tsbCard.value}`,
    cards: [rampCard, tssCard, acwrCard, tsbCard],
    plannedActual: buildPlannedActualCard(weeks),
  };
}

function buildRampCard(data: readonly PmcPoint[], latest: PmcPoint): LoadDiagnosisCard {
  const first = data[0] ?? latest;
  const delta = latest.ctl - first.ctl;
  if (delta >= 1) {
    return {
      testId: "load-ramp-diagnosis",
      label: "体能斜率",
      value: `CTL 上升 ${formatSigned(delta)}`,
      detail: "CTL↑",
      tone: "success",
    };
  }
  if (delta <= -1) {
    return {
      testId: "load-ramp-diagnosis",
      label: "体能斜率",
      value: `CTL 回落 ${formatSigned(delta)}`,
      detail: "CTL↓",
      tone: "warning",
    };
  }
  return {
    testId: "load-ramp-diagnosis",
    label: "体能斜率",
    value: "CTL 基本持平",
    detail: "CTL→",
    tone: "accent",
  };
}

function buildTssTrendCard(data: readonly PmcPoint[]): LoadDiagnosisCard {
  const midpoint = Math.max(1, Math.floor(data.length / 2));
  const previous = averageTss(data.slice(0, midpoint));
  const recent = averageTss(data.slice(midpoint));
  const delta = recent - previous;
  if (delta >= 10) {
    return {
      testId: "load-tss-trend-diagnosis",
      label: "近期 TSS",
      value: `最近 TSS 走高 ${formatSigned(delta)}`,
      detail: "TSS↑",
      tone: "warning",
    };
  }
  if (delta <= -10) {
    return {
      testId: "load-tss-trend-diagnosis",
      label: "近期 TSS",
      value: `最近 TSS 回落 ${formatSigned(delta)}`,
      detail: "TSS↓",
      tone: "success",
    };
  }
  return {
    testId: "load-tss-trend-diagnosis",
    label: "近期 TSS",
    value: "最近 TSS 平稳",
    detail: "TSS→",
    tone: "accent",
  };
}

function buildAcwrCard(acwr: number | null): LoadDiagnosisCard {
  if (acwr == null) {
    return {
      testId: "load-acwr-risk-diagnosis",
      label: "ACWR 风险",
      value: "ACWR 待计算",
      detail: "ACWR --",
      tone: "accent",
    };
  }
  if (acwr > 1.3) {
    return {
      testId: "load-acwr-risk-diagnosis",
      label: "ACWR 风险",
      value: `ACWR ${acwr.toFixed(2)} 偏高`,
      detail: "ACWR 高",
      tone: "error",
    };
  }
  if (acwr < 0.8) {
    return {
      testId: "load-acwr-risk-diagnosis",
      label: "ACWR 风险",
      value: `ACWR ${acwr.toFixed(2)} 偏低`,
      detail: "ACWR 低",
      tone: "warning",
    };
  }
  return {
    testId: "load-acwr-risk-diagnosis",
    label: "ACWR 风险",
    value: `ACWR ${acwr.toFixed(2)} 稳定`,
    detail: "ACWR 稳",
    tone: "success",
  };
}

const TSB_TONE_MAP: Record<PmcZone["tone"], LoadDiagnosisCard["tone"]> = {
  danger: "error",
  caution: "warning",
  safe: "success",
  neutral: "accent",
};

function buildTsbCard(tsb: number): LoadDiagnosisCard {
  const zone = describeTsb(tsb);
  const tone = zone ? TSB_TONE_MAP[zone.tone] : "accent";
  const formatted = tsb > 0 ? `+${tsb.toFixed(1)}` : tsb.toFixed(1);
  return {
    testId: "load-tsb-window-diagnosis",
    label: "TSB 窗口",
    value: `${zone?.label ?? "TSB"} ${formatted}`,
    detail: zone?.description ?? "TSB 平衡",
    tone,
  };
}

function buildPlannedActualCard(weeks: readonly WeekProgress[]): LoadDiagnosisCard {
  const latestWeek = weeks.at(-1) ?? null;
  if (latestWeek == null || latestWeek.planned_tss <= 0) return EMPTY_WEEK_CARD;
  const delta = latestWeek.actual_tss - latestWeek.planned_tss;
  return {
    testId: "load-planned-actual-diagnosis",
    label: "计划对照",
    value: `${latestWeek.actual_tss.toFixed(0)} / ${latestWeek.planned_tss.toFixed(0)} TSS`,
    detail: `Δ ${formatSigned(delta)} TSS`,
    tone: Math.abs(delta) <= latestWeek.planned_tss * 0.15 ? "success" : "warning",
  };
}

function averageTss(points: readonly PmcPoint[]): number {
  if (points.length === 0) return 0;
  return points.reduce((sum, point) => sum + point.tss, 0) / points.length;
}

function formatSigned(value: number): string {
  const rounded = value.toFixed(1);
  return value > 0 ? `+${rounded}` : rounded;
}
