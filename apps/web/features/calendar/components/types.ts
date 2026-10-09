export type SegmentType = "Warmup" | "SteadyState" | "IntervalsT" | "Cooldown";

export interface WorkoutSegment {
  id: string;
  segment_type: SegmentType;
  duration_s: number;
  power_low: number;
  power_high: number;
  cadence?: number;
}

export interface CalendarEventDTO {
  event_id: string;
  start_time: string;
  category: string;
  sport_type?: string;
  name?: string;
  workout_xml?: string;
  predicted_tss?: number | null;
  status?: string;
  done?: boolean;
  training_type?: string | null;
  readonly external_id?: string | null;
  workout_prescription?: {
    type: string;
    duration_min: number;
    pace_min_s_km?: number | null;
    pace_max_s_km?: number | null;
    segments: {
      type: string;
      duration_min: number;
      pace_min_s_km?: number | null;
      pace_max_s_km?: number | null;
      repetitions?: number;
      recovery_min?: number;
      rpe_min?: number;
      rpe_max?: number;
    }[];
    phase?: string;
  } | null;
  athlete_edited?: boolean;
  completed_distance_m?: number | null;
  completed_duration_s?: number | null;
  completed_avg_hr?: number | null;
  completed_rpe?: number | null;
  actual_logged_at?: string | null;
}

export interface RiskFlags {
  isOvertrainingRisk: boolean;
  isHighLoadRisk: boolean;
  isFresh: boolean;
}

const SEGMENT_TSS = (s: WorkoutSegment): number => {
  const avg = (s.power_low + s.power_high) / 2;
  return (s.duration_s * avg * avg * 100) / 3600;
};

export const totalTSS = (segs: WorkoutSegment[]): number =>
  Math.round(segs.reduce((sum, s) => sum + SEGMENT_TSS(s), 0) * 10) / 10;

export const riskFlags = (tss: number): RiskFlags => ({
  isOvertrainingRisk: tss > 200,
  isHighLoadRisk: tss > 150,
  isFresh: tss > 0 && tss < 50,
});

export const SEGMENT_TYPES: SegmentType[] = [
  "Warmup",
  "SteadyState",
  "IntervalsT",
  "Cooldown",
];

export const SEGMENT_TYPE_LABEL: Record<SegmentType, string> = {
  Warmup: "热身",
  SteadyState: "稳态",
  IntervalsT: "间歇",
  Cooldown: "放松",
};

/** PMC projection point (mirrors Python WorkoutPredictionPoint) */
export interface WorkoutPredictionPoint {
  day: string;
  projected_tss: number;
  projected_ctl: number;
  projected_atl: number;
  projected_tsb: number;
  projected_acwr: number | null;
  is_overtraining_risk: boolean;
  is_high_load_risk: boolean;
  is_fresh: boolean;
}

/** Training goal category (Chinese labels in UI) */
export type TrainingGoal =
  | "recovery"
  | "aerobic-base"
  | "tempo"
  | "threshold"
  | "vo2max"
  | "long-run";

export const TRAINING_GOALS: { value: TrainingGoal; label: string }[] = [
  { value: "recovery", label: "恢复" },
  { value: "aerobic-base", label: "有氧基础" },
  { value: "tempo", label: "节奏" },
  { value: "threshold", label: "阈值" },
  { value: "vo2max", label: "VO₂max" },
  { value: "long-run", label: "长距离" },
];

/** Calendar event category — determines visual treatment. */
export type CalendarEventCategory = "activity" | "workout" | "load";

interface CategoryVisual {
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  iconBgClass: string;
}

export const CATEGORY_VISUAL: Record<CalendarEventCategory, CategoryVisual> = {
  activity: {
    label: "已完成",
    colorClass: "text-success",
    bgClass: "bg-success/10",
    borderClass: "border-success/40",
    iconBgClass: "bg-success/15",
  },
  workout: {
    label: "计划中",
    colorClass: "text-accent-strong",
    bgClass: "bg-accent/10",
    borderClass: "border-accent/40",
    iconBgClass: "bg-accent/15",
  },
  load: {
    label: "负荷推算",
    colorClass: "text-warning",
    bgClass: "bg-warning/10",
    borderClass: "border-warning/40",
    iconBgClass: "bg-warning/15",
  },
};

/** Map a raw category string to one of the three visual buckets. */
export function displayCategory(category: string): CalendarEventCategory {
  if (category === "activity" || category === "workout" || category === "load") {
    return category;
  }
  return "workout";
}
