"use client";

import Link from "next/link";
import { PageCard, Tag } from "@shared/ui/Lovable";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatDuration, formatPaceFromSeconds } from "@shared/lib/format";
import { getSportConfig } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import { TrainingSubjective } from "./TrainingSubjective";
import type { WellnessPoint } from "@features/health/hooks/useWellness";

export interface FocusProps {
  readonly day: string;
  readonly activities: readonly ActivitySummary[];
  readonly events: readonly CalendarEventDTO[];
  readonly event: CalendarEventDTO | null;
  readonly wellness: WellnessPoint | null;
  readonly onSaved: () => void;
  readonly onPlan: () => void;
}

type FocusState = "completed" | "upcoming" | "unplanned";

/** 今天这一条回答「现在该做什么」。历史周不渲染本组件。 */
export function TrainingFocus({
  day, activities, events, event, wellness, onSaved, onPlan,
}: FocusProps) {
  const state: FocusState = activities.length > 0
    ? "completed"
    : events.length > 0 ? "upcoming" : "unplanned";
  const headline = state === "completed"
    ? "今天已经练过"
    : state === "upcoming" ? "今天要练" : "今天没有安排";
  const next = events[0] ?? null;

  return (
    <PageCard hero testId="training-focus">
      <div className="eyebrow mb-1">今天 · {day}</div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-title2 font-bold">{headline}</h2>
        <Tag tone={state === "completed" ? "info" : state === "upcoming" ? "primary" : "outline"}>
          {state === "completed" ? "已完成" : state === "upcoming" ? "待完成" : "无安排"}
        </Tag>
      </div>

      {state === "completed" ? <CompletedList activities={activities} /> : null}
      {state === "upcoming" && next ? <UpcomingPlan event={next} /> : null}
      {state === "unplanned" ? (
        <p className="mt-2 text-caption1 text-text-muted">
          这周还没有给今天编排课表。
          <button type="button" onClick={onPlan} className="tactile ml-1 inline-flex min-h-11 items-center text-accent-strong hover:underline">
            编排今天
          </button>
        </p>
      ) : null}

      <div className="mt-3 border-t border-border-subtle pt-3">
        <TrainingSubjective event={event} _wellness={wellness} day={day} onSaved={onSaved} compact />
      </div>
      <Link href="/" className="mt-2 inline-block text-caption1 text-accent-strong hover:underline">
        查看今天的训练建议
      </Link>
    </PageCard>
  );
}

function CompletedList({ activities }: { readonly activities: readonly ActivitySummary[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {activities.map((activity) => (
        <li key={activity.activity_id} className="rounded-xl bg-surface-overlay/60 p-3">
          <Link href={`/activities/${activity.activity_id}`} className="text-subheadline font-medium">
            {activity.name?.trim() || getSportConfig(activity.sport).label}
          </Link>
          <div className="num mt-1 flex flex-wrap gap-3 text-caption1 text-text-secondary">
            <span>{activity.distance_m != null ? `${(activity.distance_m / 1000).toFixed(2)} km` : "距离未记录"}</span>
            <span>{formatDuration(activity.duration_s)}</span>
            <span>TSS {activity.tss != null ? Math.round(activity.tss) : NO_VALUE}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function UpcomingPlan({ event }: { readonly event: CalendarEventDTO }) {
  const prescription = event.workout_prescription;
  const pace = prescription?.pace_min_s_km != null && prescription.pace_max_s_km != null
    ? `${formatPaceFromSeconds(prescription.pace_min_s_km)}–${formatPaceFromSeconds(prescription.pace_max_s_km)}/km`
    : null;
  return (
    <div className="mt-3 rounded-xl bg-surface-overlay/60 p-3">
      <div className="text-subheadline font-medium">{event.name || "计划训练"}</div>
      <div className="num mt-1 flex flex-wrap gap-3 text-caption1 text-text-secondary">
        <span>{prescription ? `${Math.round(prescription.duration_min)} min` : "时长未记录"}</span>
        {prescription?.display_line ? <span className="mt-1 block text-caption1 text-text-muted">{prescription.display_line}</span> : null}
        {pace ? <span>{pace}</span> : null}
        <span>预计 TSS {event.predicted_tss != null ? Math.round(event.predicted_tss) : NO_VALUE}</span>
      </div>
      <Link href="/calendar" className="mt-2 inline-block text-caption1 text-accent-strong hover:underline">
        查看课表
      </Link>
    </div>
  );
}
