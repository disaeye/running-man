import {
  describeAcwr,
  describeTsb,
  type PmcZone,
} from "@features/pmc/components/pmcSemantics";
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
  const acwrCard = buildAcwrCard(latest.acwr);
  const tsbCard = buildTsbCard(latest.tsb);
  return {
    headline: `${rampCard.value} · ${acwrCard.value} · ${tsbCard.value}`,
    cards: [rampCard, acwrCard, tsbCard],
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

const TONE_MAP: Record<PmcZone["tone"], LoadDiagnosisCard["tone"]> = {
  danger: "error",
  caution: "warning",
  safe: "success",
  neutral: "accent",
};

function buildAcwrCard(acwr: number | null): LoadDiagnosisCard {
  if (acwr == null) {
    return {
      testId: "load-acwr-risk-diagnosis",
      label: "ACWR 负荷比",
      value: "ACWR 待计算",
      detail: "ACWR --",
      tone: "accent",
    };
  }
  const zone = describeAcwr(acwr);
  return {
    testId: "load-acwr-risk-diagnosis",
    label: "ACWR 负荷比",
    value: `${zone?.label ?? "ACWR"} ${acwr.toFixed(2)}`,
    detail: zone?.description ?? "ACWR 平衡",
    tone: zone ? TONE_MAP[zone.tone] : "accent",
  };
}

function buildTsbCard(tsb: number): LoadDiagnosisCard {
  const zone = describeTsb(tsb);
  const tone = zone ? TONE_MAP[zone.tone] : "accent";
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
  if (latestWeek == null || latestWeek.planned_sessions <= 0) return EMPTY_WEEK_CARD;
  const delta = latestWeek.actual_sessions - latestWeek.planned_sessions;
  return {
    testId: "load-planned-actual-diagnosis",
    label: "训练次数",
    value: `${latestWeek.actual_sessions} / ${latestWeek.planned_sessions} 次`,
    detail: `相差 ${formatSigned(delta)} 次`,
    tone: Math.abs(delta) <= Math.max(1, latestWeek.planned_sessions * 0.15) ? "success" : "warning",
  };
}

function formatSigned(value: number): string {
  const rounded = value.toFixed(1);
  return value > 0 ? `+${rounded}` : rounded;
}
