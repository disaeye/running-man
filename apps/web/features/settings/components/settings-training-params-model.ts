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

export const SEX_OPTIONS = [
  { value: "male", label: "男" },
  { value: "female", label: "女" },
] as const;
