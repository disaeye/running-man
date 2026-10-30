// Pure pillar builders used by `analysis-summary` for running, performance,
// intensity and recovery observations.

import type { LocalReadiness } from "@features/today/hooks/useReadiness";
import type { WeekProgress } from "@features/today/hooks/useWeeklyProgress";
import { HEART_RATE_UNIT } from "@shared/config/terms";
import {
  buildRecoveryDiagnosis,
  type Diagnosis as RecoveryDiagnosis,
} from "../components/recovery-diagnosis";
import type {
  AnalysisPerformanceSample,
  AnalysisPillarSummary,
} from "./analysis-summary";

export interface PillarInputs {
  readonly weeks: readonly WeekProgress[];
  readonly readiness: LocalReadiness | null;
  readonly wellnessCount: number;
  readonly intensitySummary: string | null;
  readonly performanceSample: AnalysisPerformanceSample;
}

export function buildAllPillars(input: PillarInputs): readonly AnalysisPillarSummary[] {
  return [
    buildRunningVolumePillar(input.weeks),
    buildAbilityPillar(input.performanceSample),
    buildIntensityPillar(input.intensitySummary),
    buildRecoveryPillar(
      input.readiness === null && input.wellnessCount === 0
        ? null
        : buildRecoveryDiagnosis(input.readiness, input.wellnessCount),
    ),
  ];
}

function buildRunningVolumePillar(weeks: readonly WeekProgress[]): AnalysisPillarSummary {
  const sessions = weeks.reduce((sum, week) => sum + week.actual_sessions, 0);
  const distance = weeks.reduce((sum, week) => sum + week.actual_distance_m, 0);
  if (weeks.length === 0 || sessions === 0) {
    return {
      pillarId: "load",
      tabId: "load",
      verdict: "当前范围暂无跑步训练汇总",
      nextStep: "选择日期范围查看跑步训练记录。",
    };
  }
  return {
    pillarId: "load",
    tabId: "load",
    verdict: `${sessions} 次训练 · ${(distance / 1000).toFixed(1)} km`,
    nextStep: "查看各周的跑量和实际训练次数。",
  };
}

export function buildRecoveryPillar(
  diagnosis: RecoveryDiagnosis | null,
): AnalysisPillarSummary {
  return {
    pillarId: "recovery",
    tabId: "load",
    verdict: diagnosis?.title ?? "暂无恢复记录",
    nextStep: "继续记录睡眠、静息心率和 HRV，观察个人变化。",
  };
}

export function buildIntensityPillar(
  summary: string | null,
): AnalysisPillarSummary {
  return {
    pillarId: "intensity",
    tabId: "intensity",
    verdict: summary ?? "强度分布暂无数据",
    nextStep: "查看各周心率区间分布和轻松跑记录。",
  };
}

function formatPaceShort(seconds: number): string {
  if (seconds <= 0) return "--";
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${min}'${sec}"/km`;
}

function sampleAbilityLine(sample: AnalysisPerformanceSample): string {
  const parts: string[] = [];
  if (sample.thresholdPace != null) {
    parts.push(`阈值配速已建立 ${formatPaceShort(sample.thresholdPace)}`);
  }
  if (sample.lthr != null) parts.push(`乳酸阈心率 ${Math.round(sample.lthr)} ${HEART_RATE_UNIT}`);
  if (sample.vo2max != null) parts.push(`最大摄氧量 ${sample.vo2max.toFixed(1)} ml/kg/min`);
  return parts.length > 0 ? parts.join(" · ") : "训练能力基线正在建立";
}

export function buildAbilityPillar(
  sample: AnalysisPerformanceSample,
): AnalysisPillarSummary {
  const hasAnySignal =
    sample.thresholdPace != null ||
    sample.vo2max != null ||
    sample.lthr != null;
  if (!hasAnySignal) {
    return {
      pillarId: "performance",
      tabId: "performance",
      verdict: "能力数据正在积累中",
      nextStep: "同步包含 GPS 或比赛结果的跑步活动后，会生成阈值配速与最佳成绩趋势。",
    };
  }
  return {
    pillarId: "performance",
    tabId: "performance",
    verdict: sampleAbilityLine(sample),
    nextStep: "结合跑步活动与比赛成绩查看阈值配速和表现变化。",
  };
}
