import * as Generated from "@shared/api/generated/model";
import type { CalendarEventDTO } from "@features/calendar/components/types";

/** Convert the generated calendar response into the calendar feature DTO. */
export function mapCalendarEvent(
  raw: Generated.CalendarEventOutputOutput,
): CalendarEventDTO {
  return {
    event_id: raw.event_id,
    start_time: raw.start_time,
    category: raw.category,
    sport_type: raw.sport_type ?? undefined,
    name: raw.name ?? undefined,
    workout_xml: raw.workout_xml ?? undefined,
    predicted_tss: raw.predicted_tss ?? null,
    predicted_distance_m: raw.predicted_distance_m ?? null,
    status: raw.status ?? undefined,
    done: raw.done ?? undefined,
    training_type: raw.training_type ?? null,
    workout_prescription: raw.workout_prescription
      ? {
          ...raw.workout_prescription,
          type: raw.workout_prescription.type ?? "easy",
          duration_min: raw.workout_prescription.duration_min ?? 0,
          phase: raw.workout_prescription.phase ?? undefined,
          segments: (raw.workout_prescription.segments ?? []).map((segment) => ({
            ...segment,
            type: segment.type ?? "easy",
            duration_min: segment.duration_min ?? 0,
            repetitions: segment.repetitions ?? undefined,
            recovery_min: segment.recovery_min ?? undefined,
            rpe_min: segment.rpe_min ?? undefined,
            rpe_max: segment.rpe_max ?? undefined,
          })),
        }
      : null,
    execution: raw.execution
      ? {
          ...raw.execution,
          segments: (raw.execution.segments ?? []).map((segment) => ({
            ...segment,
            type: segment.type ?? "work",
            duration_min: segment.duration_min ?? 0,
          })),
        }
      : null,
    quality: raw.quality ?? null,
    session_classification: mapLinkedClassification(raw.session_classification),
    athlete_edited: raw.athlete_edited ?? false,
    completed_distance_m: raw.completed_distance_m ?? null,
    completed_duration_s: raw.completed_duration_s ?? null,
    completed_avg_hr: raw.completed_avg_hr ?? null,
    completed_rpe: raw.completed_rpe ?? null,
    actual_logged_at: raw.actual_logged_at ?? null,
  };
}

function mapLinkedClassification(
  value: Generated.CalendarEventOutputOutput["session_classification"],
): CalendarEventDTO["session_classification"] {
  if (!value) return null;
  return {
    ...value,
    prescription: value.prescription
      ? {
          ...value.prescription,
          type: value.prescription.type ?? "easy",
          duration_min: value.prescription.duration_min ?? 0,
          segments: (value.prescription.segments ?? []).map((segment) => ({
            ...segment,
            type: segment.type ?? "easy",
            duration_min: segment.duration_min ?? 0,
          })),
        }
      : null,
    execution: value.execution
      ? {
          ...value.execution,
          segments: (value.execution.segments ?? []).map((segment) => ({
            ...segment,
            type: segment.type ?? "work",
            duration_min: segment.duration_min ?? 0,
          })),
        }
      : null,
  };
}
