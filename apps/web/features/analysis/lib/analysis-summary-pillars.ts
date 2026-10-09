// Pure pillar builders used by `analysis-summary` to derive the four Analysis
// overview pillars (load, performance, intensity, recovery). Splitting
// builders out keeps each file within the project's 250 pure-LOC gate.

import type { PmcPoint } from "@features/pmc/hooks/usePmcData";
import type { LocalReadiness } from "@features/today/hooks/useReadiness";
import type { WeekProgress } from "@features/today/hooks/useWeeklyProgress";
import {
  buildLoadDiagnosis,
  type LoadDiagnosis,
  type LoadDiagnosisCard,
} from "../components/AnalysisLoadDiagnostics";
import {
  buildRecoveryDiagnosis,
  type Diagnosis as RecoveryDiagnosis,
} from "../components/recovery-diagnosis";
import {
  type AnalysisPerformanceSample,
  type AnalysisPillarSummary,
  type AnalysisRiskLevel,
} from "./analysis-summary";

export interface PillarInputs {
  readonly pmcPoints: readonly PmcPoint[];
  readonly weeks: readonly WeekProgress[];
  readonly readiness: LocalReadiness | null;
  readonly wellnessCount: number;
  readonly intensitySummary: string | null;
  readonly performanceSample: AnalysisPerformanceSample;
}

export function buildAllPillars(input: PillarInputs): readonly AnalysisPillarSummary[] {
  return [
    buildLoadPillar(buildLoadDiagnosis(input.pmcPoints, input.weeks)),
    buildAbilityPillar(input.performanceSample),
    buildIntensityPillar(input.intensitySummary),
    buildRecoveryPillar(
      input.readiness === null && input.wellnessCount === 0 && input.pmcPoints.length === 0
        ? null
        : buildRecoveryDiagnosis(
            input.readiness,
            input.pmcPoints.at(-1) ?? null,
            input.wellnessCount,
          ),
    ),
  ];
}

function aggregateLoadRisk(diagnosis: LoadDiagnosis | null): AnalysisRiskLevel {
  if (diagnosis === null) return "low";
  const tones = new Set<LoadDiagnosisCard["tone"]>();
  for (const card of diagnosis.cards) tones.add(card.tone);
  if (tones.has("error")) return "high";
  if (tones.has("warning")) return "medium";
  return "low";
}

function aggregateRecoveryRisk(diagnosis: RecoveryDiagnosis): AnalysisRiskLevel {
  if (diagnosis.variant === "error") return "high";
  if (diagnosis.variant === "neutral") return "medium";
  return "low";
}

export function takeHighestRisk(
  levels: readonly AnalysisRiskLevel[],
): AnalysisRiskLevel {
  const order: Record<AnalysisRiskLevel, number> = { low: 0, medium: 1, high: 2 };
  return levels.reduce<AnalysisRiskLevel>(
    (best, level) => (order[level] > order[best] ? level : best),
    "low",
  );
}

export function buildRecoveryPillar(
  diagnosis: RecoveryDiagnosis | null,
): AnalysisPillarSummary {
  if (diagnosis === null) {
    return {
      pillarId: "recovery",
      tabId: "load",
      verdict: "恢复数据暂不足以建立 30 天趋势",
      risk: "medium",
      nextStep: "继续累积睡眠、RHR、HRV 或 VO₂max 记录，趋势会逐步成型。",
    };
  }
  return {
    pillarId: "recovery",
    tabId: "load",
    verdict: diagnosis.title,
    risk: aggregateRecoveryRisk(diagnosis),
    nextStep:
      diagnosis.variant === "error"
        ? "优先观察急性负荷变化是否随恢复一起回归。"
        : "查看负荷与恢复信号是否同步。",
  };
}

export function buildLoadPillar(
  diagnosis: LoadDiagnosis | null,
): AnalysisPillarSummary {
  if (diagnosis === null) {
    return {
      pillarId: "load",
      tabId: "load",
      verdict: "训练负荷待接入更多活动",
      risk: "low",
      nextStep: "导入基础训练活动后，Analysis 会基于 CTL / ATL / TSB 给出趋势解读。",
    };
  }
  const risk = aggregateLoadRisk(diagnosis);
  const nextStep =
    risk === "high"
      ? "先稳住恢复节奏，避免在 ACWR 偏高或过载窗口继续加量。"
      : risk === "medium"
        ? "保持当前训练分布，盯紧 TSB 与 ACWR 是否进入稳定区间。"
        : "维持当前负荷分布即可，Analysis 会持续比对 30-365 天趋势。";
  return {
    pillarId: "load",
    tabId: "load",
    verdict: diagnosis.headline,
    risk,
    nextStep,
  };
}

export function buildIntensityPillar(
  summary: string | null,
): AnalysisPillarSummary {
  if (summary === null) {
    return {
      pillarId: "intensity",
      tabId: "intensity",
      verdict: "强度分布暂无数据",
      risk: "low",
      nextStep: "补齐心率、阈值或功率记录后会看到 Z1-Z5 分布与节奏建议。",
    };
  }
  const risk = summary.includes("高强度占比偏高") ? "medium" : "low";
  return {
    pillarId: "intensity",
    tabId: "intensity",
    verdict: summary,
    risk,
    nextStep:
      summary.includes("高强度占比偏高")
        ? "降低高强度占比，拉抬睡眠与恢复质量后再回到质量课。"
        : "保持当前区间分布即可，关注周内轻松日是否真正轻松。",
  };
}

function abilityFamily(sport: string | null): "running" | "cycling" | "unknown" {
  if (sport === "Run" || sport === "TrailRun" || sport === "VirtualRun") {
    return "running";
  }
  if (sport === "Ride" || sport === "VirtualRide" || sport === "Bike") {
    return "cycling";
  }
  return "unknown";
}

function formatPaceShort(seconds: number): string {
  if (seconds <= 0) return "--";
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${min}'${sec}"/km`;
}

function sampleAbilityLine(
  sample: AnalysisPerformanceSample,
  family: "running" | "cycling" | "unknown",
): string {
  const parts: string[] = [];
  if (sample.thresholdPace != null) {
    parts.push(`阈值配速已建立 ${formatPaceShort(sample.thresholdPace)}`);
  }
  if (sample.lthr != null) parts.push(`LTHR ${Math.round(sample.lthr)} bpm`);
  if (sample.ftp != null) parts.push(`FTP ${Math.round(sample.ftp)} W`);
  if (sample.vo2max != null) parts.push(`VO₂max ${sample.vo2max.toFixed(1)} ml/kg/min`);
  if (parts.length === 0) {
    return family === "cycling" ? "骑行功率主线尚未建立" : "训练表现基线正在建立";
  }
  return parts.join(" · ");
}

export function buildAbilityPillar(
  sample: AnalysisPerformanceSample,
): AnalysisPillarSummary {
  const family = abilityFamily(sample.sport);
  const hasAnySignal =
    sample.ftp != null ||
    sample.thresholdPace != null ||
    sample.vo2max != null ||
    sample.lthr != null;
  if (!hasAnySignal) {
    return {
      pillarId: "performance",
      tabId: "performance",
      verdict: "能力数据正在积累中",
      risk: "low",
      nextStep:
        family === "cycling"
          ? "同步包含功率曲线的骑行活动后会生成 FTP 与功率趋势。"
          : "同步包含 GPS 或比赛结果的跑步活动后会生成阈值配速与 PR 趋势。",
    };
  }
  return {
    pillarId: "performance",
    tabId: "performance",
    verdict: sampleAbilityLine(sample, family),
    risk: "low",
    nextStep:
      family === "cycling"
        ? "检查近期输出是否保持可持续。"
        : "把阈值配速、VO₂max 与比赛预测放在同一时间轴对比。",
  };
}
