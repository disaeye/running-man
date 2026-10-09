// Deterministic executive-summary model for the Analysis overview.
//
// Combines the existing pure load, recovery, intensity, and physiology summary
// models into a single verdict / risk / next-step structure. The summary is
// pure: no fetch, no AI calls, no side effects. All inputs are readonly;
// identical inputs always yield identical output. Build helpers (pillar
// construction, risk aggregation) live in `analysis-summary-pillars.ts` so
// each file stays within the project's 250 pure-LOC gate.

import type { PmcPoint } from "@features/pmc/hooks/usePmcData";
import type { WellnessPoint } from "@features/health/hooks/useWellness";
import type { LocalReadiness } from "@features/today/hooks/useReadiness";
import type { WeekProgress } from "@features/today/hooks/useWeeklyProgress";
import {
  ANALYSIS_FORBIDDEN_PHRASES,
  assertNoForbiddenPhrases,
} from "./analysis-forbidden-phrases";
import {
  buildAllPillars,
  takeHighestRisk,
} from "./analysis-summary-pillars";

export type AnalysisRiskLevel = "low" | "medium" | "high";

export type AnalysisPillarId = "load" | "performance" | "intensity" | "recovery";

export type AnalysisPillarSummary = {
  readonly pillarId: AnalysisPillarId;
  readonly tabId: "load" | "performance" | "intensity";
  readonly verdict: string;
  readonly risk: AnalysisRiskLevel;
  readonly nextStep: string;
};

export type AnalysisExecutiveSummary = {
  readonly verdict: string;
  readonly risk: AnalysisRiskLevel;
  readonly nextStep: string;
  readonly provenanceLine: string;
  readonly sampleLine: string;
  readonly pillars: readonly AnalysisPillarSummary[];
};

export interface AnalysisPerformanceSample {
  readonly sport: string | null;
  readonly ftp: number | null;
  readonly lthr: number | null;
  readonly thresholdPace: number | null;
  readonly vo2max: number | null;
  readonly sessionRecordCount: number;
}

export interface BuildAnalysisExecutiveSummaryInput {
  readonly pmcPoints: readonly PmcPoint[];
  readonly weeks: readonly WeekProgress[];
  readonly wellness: readonly WellnessPoint[];
  readonly readiness: LocalReadiness | null;
  readonly intensitySummary: string | null;
  readonly performanceSample: AnalysisPerformanceSample;
  readonly dateRange: { readonly from: string; readonly to: string };
  readonly sampleCount: number;
}

export function buildAnalysisExecutiveSummary(
  input: BuildAnalysisExecutiveSummaryInput,
): AnalysisExecutiveSummary {
  const pillars = buildAllPillars({
    pmcPoints: input.pmcPoints,
    weeks: input.weeks,
    readiness: input.readiness,
    wellnessCount: input.wellness.length,
    intensitySummary: input.intensitySummary,
    performanceSample: input.performanceSample,
  });

  const combinedRisk = takeHighestRisk(pillars.map((p) => p.risk));

  const verdict =
    combinedRisk === "high"
      ? "需要先稳住当前负荷与恢复差距"
      : combinedRisk === "medium"
        ? "训练系统处于观察窗口"
        : "训练整体节奏稳定";

  const nextStep =
    combinedRisk === "high"
      ? "看负荷"
      : combinedRisk === "medium"
        ? "看表现与强度"
        : "选板块看证据";

  const provenanceLine = `${input.dateRange.from} → ${input.dateRange.to} · ${input.pmcPoints.length} 天`;
  const sampleLine = sampleLineFromCount(input.sampleCount);

  const summary: AnalysisExecutiveSummary = {
    verdict,
    risk: combinedRisk,
    nextStep,
    provenanceLine,
    sampleLine,
    pillars,
  };
  assertExecutiveCopySafe(summary);
  return summary;
}

function sampleLineFromCount(sampleCount: number): string {
  if (sampleCount <= 0) return "暂无样本";
  if (sampleCount < 7) return `覆盖 ${sampleCount} 天`;
  return `覆盖 ${sampleCount} 天`;
}

function assertExecutiveCopySafe(summary: AnalysisExecutiveSummary): void {
  assertNoForbiddenPhrases("verdict", summary.verdict);
  assertNoForbiddenPhrases("nextStep", summary.nextStep);
  assertNoForbiddenPhrases("provenance", summary.provenanceLine);
  assertNoForbiddenPhrases("sample", summary.sampleLine);
  for (const pillar of summary.pillars) {
    assertNoForbiddenPhrases(`pillar/${pillar.pillarId}/verdict`, pillar.verdict);
    assertNoForbiddenPhrases(`pillar/${pillar.pillarId}/nextStep`, pillar.nextStep);
  }
}

export { ANALYSIS_FORBIDDEN_PHRASES };
