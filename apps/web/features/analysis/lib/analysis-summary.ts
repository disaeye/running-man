// Deterministic executive-summary model for the Analysis overview.
//
// Combines running distance, recovery, intensity, and physiology summaries.
// The summary is pure: no fetch, no AI calls, no side effects. All inputs are readonly;
// identical inputs always yield identical output. Build helpers (pillar
// construction, risk aggregation) live in `analysis-summary-pillars.ts` so
// each file stays within the project's 250 pure-LOC gate.

import type { WellnessPoint } from "@features/health/hooks/useWellness";
import type { LocalReadiness } from "@features/today/hooks/useReadiness";
import type { WeekProgress } from "@features/today/hooks/useWeeklyProgress";
import {
  ANALYSIS_FORBIDDEN_PHRASES,
  assertNoForbiddenPhrases,
} from "./analysis-forbidden-phrases";
import { buildAllPillars } from "./analysis-summary-pillars";

export type AnalysisPillarId = "load" | "performance" | "intensity" | "recovery";

export type AnalysisPillarSummary = {
  readonly pillarId: AnalysisPillarId;
  readonly tabId: "load" | "performance" | "intensity";
  readonly verdict: string;
  readonly nextStep: string;
};

export type AnalysisExecutiveSummary = {
  readonly verdict: string;
  readonly nextStep: string;
  readonly provenanceLine: string;
  readonly sampleLine: string;
  readonly pillars: readonly AnalysisPillarSummary[];
};

export interface AnalysisPerformanceSample {
  readonly sport: string | null;
  readonly lthr: number | null;
  readonly thresholdPace: number | null;
  readonly vo2max: number | null;
  readonly sessionRecordCount: number;
}

export interface BuildAnalysisExecutiveSummaryInput {
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
    weeks: input.weeks,
    readiness: input.readiness,
    wellnessCount: input.wellness.length,
    intensitySummary: input.intensitySummary,
    performanceSample: input.performanceSample,
  });

  const runningVolume = pillars.find((pillar) => pillar.pillarId === "load");
  const verdict = runningVolume?.verdict ?? "当前范围暂无跑步训练汇总";
  const nextStep = runningVolume?.nextStep ?? "选择日期范围查看跑步训练记录。";

  const provenanceLine = `${input.dateRange.from} → ${input.dateRange.to}`;
  const sampleLine = sampleLineFromCount(input.sampleCount);

  const summary: AnalysisExecutiveSummary = {
    verdict,
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
