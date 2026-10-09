export interface AutoCalcResult {
  hr_max: {
    hr_max: number | null;
    method: string | null;
    confidence: string | null;
    data_sufficient: boolean;
    near_max_count: number;
    session_count: number;
  };
  lthr: {
    lthr: number | null;
    method: string | null;
    confidence: string | null;
    data_sufficient: boolean;
    near_threshold_count: number;
  };
  threshold_pace: {
    threshold_pace_s_per_km: number | null;
    confidence: string | null;
    data_sufficient: boolean;
    effort_count: number;
  };
}

export const SEX_OPTIONS = [
  { value: "male", label: "男" },
  { value: "female", label: "女" },
] as const;

export const CONFIDENCE_LABEL: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export const CONFIDENCE_VARIANT: Record<string, "success" | "warning" | "error"> = {
  high: "success",
  medium: "warning",
  low: "error",
};

export const METHOD_LABEL: Record<string, string> = {
  tangent: "切线法",
  rolling_max: "滚动最高",
  best_effort_window: "最佳努力窗口",
  critical_speed_model: "临界速度模型",
};

export function formatPace(sPerKm: number): string {
  const min = Math.floor(sPerKm / 60);
  const sec = Math.round(sPerKm % 60);
  return `${min}'${sec.toString().padStart(2, "0")}"`;
}
