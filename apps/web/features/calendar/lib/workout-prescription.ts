import type { SportFamily } from "@shared/config/sport-config";
import type { WorkoutTemplateSegment } from "@shared/types/workout-templates";
import type {
  CalendarEventDTO,
  SegmentType,
  SessionSegmentDTO,
  TrainingGoal,
} from "@features/calendar/components/types";
import { getSportConfig } from "@shared/config/sport-config";
import { formatPaceFromSeconds } from "@shared/lib/format";

export interface BuilderSegment {
  readonly id: string;
  readonly segment_type: SegmentType;
  readonly duration_s: number;
  readonly pace_min_s_km?: number | null;
  readonly pace_max_s_km?: number | null;
  readonly repetitions?: number | null;
  readonly recovery_s?: number | null;
}

const GOAL_TO_TRAINING_TYPE: Record<TrainingGoal, string> = {
  recovery: "recovery",
  "aerobic-base": "easy",
  tempo: "tempo",
  threshold: "threshold",
  vo2max: "intervals",
  "long-run": "long",
};

const TRAINING_TYPE_TO_GOAL: Record<string, TrainingGoal> = {
  recovery: "recovery",
  easy: "aerobic-base",
  "aerobic-base": "aerobic-base",
  tempo: "tempo",
  threshold: "threshold",
  intervals: "vo2max",
  interval: "vo2max",
  vo2max: "vo2max",
  long: "long-run",
  "long-run": "long-run",
};

export function goalToTrainingType(goal: TrainingGoal): string {
  return GOAL_TO_TRAINING_TYPE[goal];
}

export function trainingTypeToGoal(type: string | null | undefined): TrainingGoal {
  if (!type) return "aerobic-base";
  return TRAINING_TYPE_TO_GOAL[type] ?? "aerobic-base";
}

export function defaultSportForFamily(family: SportFamily | "all"): string {
  if (family === "strength") return "Workout";
  if (family === "cycling") return "Ride";
  return "Run";
}

/**
 * 解析跑者习惯的配速输入（支持 `4:30` / `4'30` / `4：30`，也兼容合法秒数 `270`）。
 * 空输入返回 `{ ok: true, value: null }`；非法格式或越界返回错误信息。
 */
export function parsePaceInput(
  raw: string,
): { readonly ok: true; readonly value: number | null } | { readonly ok: false; readonly error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const normalized = trimmed.replaceAll('"', "").replaceAll("'", ":").replaceAll("：", ":");
  const colonMatch = normalized.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colonMatch) {
    const minutes = Number(colonMatch[1]);
    const seconds = Number(colonMatch[2]);
    if (seconds >= 60) return { ok: false, error: "配速秒数需在 0–59 之间" };
    const total = minutes * 60 + seconds;
    if (total < 120 || total > 1800) return { ok: false, error: "配速需在 2:00–30:00 /km 之间" };
    return { ok: true, value: total };
  }
  if (/^\d+$/.test(normalized)) {
    const numeric = Number(normalized);
    if (numeric >= 2 && numeric <= 30) return { ok: true, value: numeric * 60 };
    if (numeric >= 120 && numeric <= 1800) return { ok: true, value: numeric };
    return { ok: false, error: "配速格式示例：4:30" };
  }
  return { ok: false, error: "配速格式示例：4:30" };
}

export function formatPaceInput(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

export function formatSegmentDuration(durationS: number): string {
  const total = Math.max(0, Math.round(durationS));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min > 0 && sec > 0) return `${min} 分 ${sec} 秒`;
  if (min > 0) return `${min} 分钟`;
  return `${sec} 秒`;
}

export function totalBuilderSeconds(segments: readonly BuilderSegment[]): number {
  let total = 0;
  for (const seg of segments) {
    const reps = seg.segment_type === "IntervalsT" ? Math.max(1, seg.repetitions ?? 1) : 1;
    const recovery = reps > 1 && seg.recovery_s ? seg.recovery_s * (reps - 1) : 0;
    total += seg.duration_s * reps + recovery;
  }
  return total;
}

export function builderSegmentFromTemplate(
  seg: WorkoutTemplateSegment,
  id: string,
): BuilderSegment {
  const segmentType = normalizeSegmentType(seg.segment_type);
  return {
    id,
    segment_type: segmentType,
    duration_s: seg.duration_s,
    pace_min_s_km: seg.pace_min_s_km ?? null,
    pace_max_s_km: seg.pace_max_s_km ?? null,
    repetitions: segmentType === "IntervalsT" ? (seg.repetitions ?? 1) : null,
    recovery_s: segmentType === "IntervalsT" ? (seg.recovery_s ?? null) : null,
  };
}

export function segmentsFromEvent(event?: CalendarEventDTO): BuilderSegment[] {
  const prescriptionSegments = event?.workout_prescription?.segments;
  if (prescriptionSegments && prescriptionSegments.length > 0) {
    return prescriptionSegments
      .filter((seg) => seg.type !== "recovery" && seg.role !== "recovery")
      .map((seg, index) => {
        const segmentType = normalizeSegmentType(seg.type);
        const reps = segmentType === "IntervalsT" ? Math.max(1, seg.repetitions ?? 1) : 1;
        const totalSec = seg.duration_s ?? Math.round((seg.duration_min ?? 0) * 60);
        const perRepSec = reps > 1 ? Math.round(totalSec / reps) : totalSec;
        const recoverySec = seg.recovery_duration_s ?? (seg.recovery_min != null ? Math.round(seg.recovery_min * 60) : null);
        return {
          id: `ev-${index}`,
          segment_type: segmentType,
          duration_s: Math.max(1, perRepSec),
          pace_min_s_km: seg.pace_min_s_km ?? null,
          pace_max_s_km: seg.pace_max_s_km ?? null,
          repetitions: segmentType === "IntervalsT" ? reps : null,
          recovery_s: segmentType === "IntervalsT" ? recoverySec : null,
        };
      });
  }
  try {
    const parsed = JSON.parse(event?.workout_xml ?? "");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeSegmentType(raw: string): SegmentType {
  const lower = raw.toLowerCase();
  if (lower === "warmup") return "Warmup";
  if (lower === "cooldown") return "Cooldown";
  if (lower === "intervalst" || lower === "intervals" || lower === "interval") return "IntervalsT";
  return "SteadyState";
}

function prescriptionSegmentType(segmentType: SegmentType, trainingType: string): string {
  if (segmentType === "Warmup") return "warmup";
  if (segmentType === "Cooldown") return "cooldown";
  if (segmentType === "IntervalsT") return "intervals";
  return trainingType || "easy";
}

/** 构造前后端共用的结构化处方与预计距离，保证日详情/首页/日历直接可读。 */
export function buildWorkoutPrescriptionPayload({
  date,
  name,
  goal,
  sportType,
  segments,
}: {
  readonly date: string;
  readonly name: string;
  readonly goal: TrainingGoal;
  readonly sportType: string;
  readonly segments: readonly BuilderSegment[];
}) {
  const isRun = getSportConfig(sportType).isRun;
  const trainingType = isRun ? goalToTrainingType(goal) : "strength";
  const totalSec = totalBuilderSeconds(segments);
  const totalMin = Math.max(1, Math.round(totalSec / 60));

  let distanceM = 0;
  let hasDistance = false;
  let paceMinOverall: number | null = null;
  let paceMaxOverall: number | null = null;

  const prescriptionSegments: SessionSegmentDTO[] = segments.map((seg, index) => {
    const reps = seg.segment_type === "IntervalsT" ? Math.max(1, seg.repetitions ?? 1) : 1;
    const workSec = seg.duration_s * reps;
    const recoveryMin = reps > 1 && seg.recovery_s ? Number((seg.recovery_s / 60).toFixed(2)) : null;
    const paceMin = isRun ? (seg.pace_min_s_km ?? null) : null;
    const paceMax = isRun ? (seg.pace_max_s_km ?? paceMin) : null;
    if (paceMin != null && paceMax != null) {
      const meanPace = (paceMin + paceMax) / 2;
      distanceM += (workSec / meanPace) * 1000;
      hasDistance = true;
      if (seg.segment_type === "IntervalsT" || seg.segment_type === "SteadyState") {
        paceMinOverall = paceMinOverall == null ? paceMin : Math.min(paceMinOverall, paceMin);
        paceMaxOverall = paceMaxOverall == null ? paceMax : Math.max(paceMaxOverall, paceMax);
      }
    }
    return {
      type: prescriptionSegmentType(seg.segment_type, trainingType),
      role: seg.segment_type === "Warmup" ? "warmup" : seg.segment_type === "Cooldown" ? "cooldown" : "work",
      order: index + 1,
      duration_min: Number((workSec / 60).toFixed(2)),
      duration_s: workSec,
      pace_min_s_km: paceMin,
      pace_max_s_km: paceMax,
      repetitions: reps > 1 ? reps : null,
      recovery_min: recoveryMin,
      recovery_duration_s: reps > 1 ? (seg.recovery_s ?? null) : null,
    };
  });

  const predictedDistanceM = isRun && hasDistance ? Math.round(distanceM) : null;
  const displayName = name.trim() || `训练 ${date}`;
  const paceSummary =
    paceMinOverall != null && paceMaxOverall != null
      ? ` · ${formatPaceFromSeconds(paceMinOverall)}–${formatPaceFromSeconds(paceMaxOverall)}/km`
      : "";
  const distanceSummary = predictedDistanceM != null ? ` · ${(predictedDistanceM / 1000).toFixed(1)} km` : "";
  const displayLine = `${displayName} · ${totalMin} 分钟${distanceSummary}${paceSummary}`;

  return {
    name: displayName,
    sportType,
    trainingType,
    predictedDistanceM,
    workoutXml: JSON.stringify(segments),
    prescription: {
      version: 1,
      type: trainingType,
      duration_min: totalMin,
      pace_min_s_km: paceMinOverall,
      pace_max_s_km: paceMaxOverall,
      segments: prescriptionSegments,
      primary_stimulus: isRun ? goal : "strength",
      display_line: displayLine,
    },
  };
}
