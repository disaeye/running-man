import { getSportConfig } from "@shared/config/sport-config";

export type AnalysisActivityKind = "running" | "strength" | "other";

export function getAnalysisActivityKind(
  sport: string | null | undefined,
): AnalysisActivityKind {
  const config = getSportConfig(sport ?? "");
  if (config.isStrength) return "strength";
  if (config.isRun) return "running";
  return "other";
}

