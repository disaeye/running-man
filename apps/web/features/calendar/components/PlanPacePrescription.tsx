import type { CalendarEventDTO } from "@features/calendar/components/types";

type PrescriptionSegment = {
  type: string;
  duration_min: number;
  pace_min_s_km?: number | null;
  pace_max_s_km?: number | null;
  repetitions?: number;
  recovery_min?: number;
  rpe_min?: number;
  rpe_max?: number;
};

type RunPrescription = {
  type: string;
  duration_min: number;
  pace_min_s_km?: number | null;
  pace_max_s_km?: number | null;
  segments: PrescriptionSegment[];
  phase?: string;
};

const LABELS: Record<string, string> = {
  warmup: "热身",
  easy: "轻松跑",
  recovery: "恢复跑",
  long: "长距离跑",
  tempo: "节奏跑",
  threshold: "阈值段",
  interval: "间歇段",
  intervals: "间歇跑",
  cooldown: "放松跑",
};

function paceText(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min == null || max == null) return null;
  return `${formatPace(min)}–${formatPace(max)} /公里`;
}

function formatPace(seconds: number): string {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

export function PlanPacePrescription({ event }: { event: CalendarEventDTO }) {
  const prescription = event.workout_prescription as RunPrescription | null | undefined;
  if (!prescription) return null;
  const overallPace = paceText(prescription.pace_min_s_km, prescription.pace_max_s_km);

  return (
    <section className="rounded-lg border border-border-subtle bg-surface-overlay/45 p-3" aria-label="跑步训练处方">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-subheadline font-semibold text-text-primary">
          {LABELS[prescription.type] ?? "跑步训练"} · {prescription.duration_min} 分钟
        </p>
        {overallPace && <p className="font-mono text-caption1 text-text-secondary">{overallPace}</p>}
      </div>
      <ol className="mt-2 space-y-1.5">
        {prescription.segments.map((segment, index) => {
          const pace = paceText(segment.pace_min_s_km, segment.pace_max_s_km);
          const repetitions = segment.repetitions ? `${segment.repetitions} 组 · ` : "";
          const recovery = segment.recovery_min ? ` · 组间恢复 ${segment.recovery_min} 分钟` : "";
          const rpe = segment.rpe_min != null && segment.rpe_max != null
            ? ` · RPE ${segment.rpe_min}–${segment.rpe_max}`
            : "";
          return (
            <li key={`${segment.type}-${index}`} className="text-caption1 text-text-secondary">
              <span className="font-medium text-text-primary">{LABELS[segment.type] ?? segment.type}</span>
              {" · "}{repetitions}{segment.duration_min} 分钟
              {pace ? ` · ${pace}` : ""}{recovery}{rpe}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-caption1 text-text-muted">配速范围是训练参考；身体感觉异常时应降低强度。</p>
    </section>
  );
}
