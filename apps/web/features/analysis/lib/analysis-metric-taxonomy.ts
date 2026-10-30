import { getSportConfig } from "@shared/config/sport-config";
import type { TERMS } from "@shared/config/terms";

export type AnalysisSportFamily = "running" | "strength" | "unknown";

export type AnalysisMetricKey =
  | "thresholdPace"
  | "lthr"
  | "vo2max"
  | "raceSignal"
  | "trainingLoad"
  | "heartRate"
  | "bodyWeight";

export type AnalysisMetricAvailability = "always" | "whenAvailable";

export type AnalysisMetricDescriptor = {
  key: AnalysisMetricKey;
  copyKey: keyof typeof TERMS;
  availability: AnalysisMetricAvailability;
};

export type AnalysisMetricTaxonomy = {
  readonly family: AnalysisSportFamily;
  readonly primary: readonly AnalysisMetricDescriptor[];
  readonly secondary: readonly AnalysisMetricDescriptor[];
};

const RUNNING_PRIMARY = [
  { key: "thresholdPace", copyKey: "THRESHOLD_PACE", availability: "always" },
  { key: "lthr", copyKey: "LTHR", availability: "always" },
  { key: "vo2max", copyKey: "VO2MAX", availability: "always" },
  { key: "raceSignal", copyKey: "RACE_SIGNAL", availability: "whenAvailable" },
] as const satisfies readonly AnalysisMetricDescriptor[];

const RUNNING_SECONDARY = [
  { key: "heartRate", copyKey: "HR", availability: "always" },
] as const satisfies readonly AnalysisMetricDescriptor[];

const STRENGTH_PRIMARY = [
  { key: "heartRate", copyKey: "HR", availability: "whenAvailable" },
] as const satisfies readonly AnalysisMetricDescriptor[];

const STRENGTH_SECONDARY = [
  { key: "bodyWeight", copyKey: "BODY_WEIGHT", availability: "whenAvailable" },
] as const satisfies readonly AnalysisMetricDescriptor[];

const UNKNOWN_PRIMARY = [
  { key: "vo2max", copyKey: "VO2MAX", availability: "always" },
  { key: "lthr", copyKey: "LTHR", availability: "whenAvailable" },
] as const satisfies readonly AnalysisMetricDescriptor[];

const UNKNOWN_SECONDARY = [
  { key: "thresholdPace", copyKey: "THRESHOLD_PACE", availability: "whenAvailable" },
  { key: "heartRate", copyKey: "HR", availability: "always" },
] as const satisfies readonly AnalysisMetricDescriptor[];

const STRENGTH_SPORTS = new Set(["Workout", "WeightTraining"]);

export function getAnalysisSportFamily(sport: string | null | undefined): AnalysisSportFamily {
  const sportKey = sport ?? "";
  const config = getSportConfig(sportKey);
  if (config.isRun) return "running";
  if (STRENGTH_SPORTS.has(sportKey)) return "strength";
  return "unknown";
}

/**
 * Metrics to show for a sport.
 *
 * Returns running and strength metrics supported by the current interface.
 */
export function getAnalysisMetricTaxonomy(
  sport: string | null | undefined,
): AnalysisMetricTaxonomy {
  const family = getAnalysisSportFamily(sport);
  switch (family) {
    case "running":
      return { family, primary: RUNNING_PRIMARY, secondary: RUNNING_SECONDARY };
    case "strength":
      return { family, primary: STRENGTH_PRIMARY, secondary: STRENGTH_SECONDARY };
    case "unknown":
      return { family, primary: UNKNOWN_PRIMARY, secondary: UNKNOWN_SECONDARY };
    default:
      throw new Error(`Unhandled sport family: ${family}`);
  }
}
