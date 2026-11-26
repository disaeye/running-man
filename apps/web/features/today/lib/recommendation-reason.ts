import type { CoachRecommendation } from "@features/today/hooks/useCoachContext";

export function recommendationReason(decision: CoachRecommendation, hasPrescription: boolean): string {
  if (!hasPrescription) return decision.reason;
  return decision.reason
    .replace(/\d+'\d{2}"[–-]\d+'\d{2}"\s*\/km/g, "课表配速")
    .replace(/\d+'\d{2}"\/km/g, "课表配速");
}
