export interface AutoCalcResult {
  hr_max: {
    hr_max: number | null;
    method: string | null;
    confidence: string | null;
    data_sufficient: boolean;
    near_max_count: number;
    session_count: number;
    required_sessions: number;
    input_window_days: number;
  };
  lthr: {
    lthr: number | null;
    method: string | null;
    confidence: string | null;
    data_sufficient: boolean;
    near_threshold_count: number;
    required_efforts: number;
    input_window_days: number;
  };
  threshold_pace: {
    threshold_pace_s_per_km: number | null;
    method: string | null;
    confidence: string | null;
    data_sufficient: boolean;
    effort_count: number;
    required_efforts: number;
    input_window_days: number;
  };
  /** When the stored thresholds were last written by an estimate. */
  computed_at: string | null;
}

import type { TrainingDraft } from "./ThresholdFields";

export const SEX_OPTIONS = [
  { value: "male", label: "男" },
  { value: "female", label: "女" },
] as const;

export function validateTrainingDraft(
  draft: TrainingDraft,
): string | null {
  if (draft.hr_max != null && (draft.hr_max <= 0 || draft.hr_max > 260)) {
    return "最大心率应在 1 至 260 bpm 之间";
  }
  if (draft.resting_hr != null && (draft.resting_hr <= 0 || draft.resting_hr > 120)) {
    return "静息心率应在 1 至 120 bpm 之间";
  }
  if (draft.lthr != null && (draft.lthr <= 0 || draft.lthr > 240)) {
    return "乳酸阈值心率应在 1 至 240 bpm 之间";
  }
  if (draft.threshold_pace != null && (draft.threshold_pace < 120 || draft.threshold_pace > 900)) {
    return "阈值配速应在 2'00\" 至 15'00\" /km 之间";
  }
  if (draft.weight_kg != null && (draft.weight_kg < 20 || draft.weight_kg > 300)) {
    return "体重应在 20 至 300 kg 之间";
  }
  return null;
}
