import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatDistance, formatDuration, formatPaceFromSeconds } from "@shared/lib/format";
import { getSportConfig } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";

/** 计划栏：目标距离、配速区间与预计负荷。 */
export function DemoPlanColumn({ event }: { readonly event: CalendarEventDTO | undefined }) {
  const prescription = event?.workout_prescription ?? null;
  const pace =
    prescription?.pace_min_s_km != null && prescription?.pace_max_s_km != null
      ? `${formatPaceFromSeconds(prescription.pace_min_s_km)}–${formatPaceFromSeconds(prescription.pace_max_s_km)}`
      : null;
  const distance = event?.predicted_distance_m ?? null;

  return (
    <div className="rounded-lg bg-surface-overlay px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-caption1 font-semibold text-text-secondary">
        <span aria-hidden="true">◎</span>
        计划课表指标
      </p>
      <div className="mt-2 space-y-1.5">
        <Field
          label="目标距离"
          value={distance != null ? formatDistance(distance) : NO_VALUE}
          note={distance == null ? "课表没有距离目标" : undefined}
        />
        <Field
          label="指导配速区间"
          value={pace != null ? `${pace} /km` : NO_VALUE}
          note={pace == null ? "课表没有配速区间" : undefined}
        />
        <Field
          label="预计负荷"
          value={event?.predicted_tss != null ? `${Math.round(event.predicted_tss)}` : NO_VALUE}
          unit="TSS"
          note={event?.predicted_tss == null ? "课表没有预计负荷" : undefined}
        />
      </div>
    </div>
  );
}

/** 实际栏：距离、用时、配速、心率与步频。 */
export function DemoActualColumn({
  activities,
}: {
  readonly activities: readonly ActivitySummary[];
}) {
  if (activities.length === 0) {
    return (
      <div className="rounded-lg bg-surface-overlay px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-caption1 font-semibold text-text-secondary">
          <span aria-hidden="true">◔</span>
          实际完成遥测
        </p>
        <p className="mt-2 text-caption1 text-text-muted">这一天还没有训练记录</p>
      </div>
    );
  }

  const distance = activities.reduce((sum, activity) => sum + (activity.distance_m ?? 0), 0);
  const duration = activities.reduce((sum, activity) => sum + (activity.duration_s ?? 0), 0);
  const pace = distance > 0 && duration > 0 ? duration / (distance / 1000) : null;
  const hr = activities.find((activity) => activity.avg_hr != null)?.avg_hr ?? null;
  const cadence = activities.find((activity) => activity.avg_cadence != null)?.avg_cadence ?? null;
  const sportLabel = getSportConfig(activities[0]?.sport ?? "Run").label;

  return (
    <div className="rounded-lg bg-surface-overlay px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-caption1 font-semibold text-text-secondary">
        <span aria-hidden="true">◔</span>
        实际完成遥测
      </p>
      <div className="mt-2 space-y-1.5">
        <Field label="实际距离" value={distance > 0 ? formatDistance(distance) : NO_VALUE} />
        <Field label="实际用时" value={duration > 0 ? formatDuration(duration) : NO_VALUE} />
        <Field
          label="平均配速"
          value={pace != null ? formatPaceFromSeconds(Math.round(pace)) : NO_VALUE}
          unit="/km"
        />
        <Field label="平均心率" value={hr != null ? String(Math.round(hr)) : NO_VALUE} unit="bpm" />
        <Field
          label="平均步频"
          value={cadence != null ? String(Math.round(cadence)) : NO_VALUE}
          unit="rpm"
        />
      </div>
      <p className="mt-2 text-caption1 text-text-muted">
        {activities.length > 1 ? `${activities.length} 次记录 · ${sportLabel}` : sportLabel}
      </p>
    </div>
  );
}

/** 两栏共用的读数行。 */
function Field({
  label,
  value,
  unit,
  note,
}: {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly note?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-caption1 text-text-muted">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1">
        <span
          className={`font-mono text-subheadline tabular-nums ${
            value === NO_VALUE ? "text-text-muted" : "text-text-primary"
          }`}
        >
          {value}
        </span>
        {unit ? <span className="text-caption1 text-text-muted">{unit}</span> : null}
      </p>
      {note ? <p className="mt-0.5 text-caption1 text-text-muted">{note}</p> : null}
    </div>
  );
}

/** 以实际距离除以计划距离计算完成比例。 */
export function completionPct(
  event: CalendarEventDTO | undefined,
  activities: readonly ActivitySummary[],
): string {
  const planned = event?.predicted_distance_m ?? null;
  if (planned == null || planned <= 0) return NO_VALUE;
  const actual = activities.reduce((sum, activity) => sum + (activity.distance_m ?? 0), 0);
  return `${Math.round((actual / planned) * 100)}%`;
}
