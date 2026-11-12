"use client";

import Link from "next/link";
import { PageCard, Tag } from "@shared/ui/Lovable";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatDuration, formatPaceFromSeconds } from "@shared/lib/format";
import { getSportConfig } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import type { WellnessPoint } from "@features/health/hooks/useWellness";
import { matchDayEvents } from "../lib/match";
import { TrainingSubjective } from "./TrainingSubjective";

export interface FocusProps {
  readonly day: string;
  readonly activities: readonly ActivitySummary[];
  readonly events: readonly CalendarEventDTO[];
  readonly event: CalendarEventDTO | null;
  readonly wellness: WellnessPoint | null;
  readonly wellnessLoading?: boolean;
  readonly wellnessError?: string | null;
  readonly onRetryWellness?: () => void;
  readonly onSaved: () => void;
  readonly onPlan: () => void;
}

type FocusState = "completed" | "partial" | "upcoming" | "unplanned";

/**
 * 今天这一条回答「现在该做什么」。历史周不渲染本组件。
 *
 * 有尚未匹配的计划课时，优先展示待完成的计划，已完成的活动并列展示，
 * 避免一次晨跑或力量训练遮盖尚未完成的当日计划课。
 */
export function TrainingFocus({
  day, activities, events, event, wellness, wellnessLoading, wellnessError, onRetryWellness, onSaved, onPlan,
}: FocusProps) {
  const matches = matchDayEvents(day, day, events, activities);
  const pendingEvents = events.filter((item) => {
    const status = matches.get(item.event_id)?.status;
    return status === "upcoming" || status === "missed";
  });

  const state: FocusState = pendingEvents.length > 0
    ? (activities.length > 0 || pendingEvents.length < events.length ? "partial" : "upcoming")
    : (activities.length > 0 || events.length > 0 ? "completed" : "unplanned");

  const headline = state === "completed"
    ? "今天已经练过"
    : state === "partial"
      ? "今天还要练"
      : state === "upcoming"
        ? "今天要练"
        : "今天没有安排";

  const tagTone = state === "completed"
    ? "info"
    : state === "partial"
      ? "warn"
      : state === "upcoming"
        ? "primary"
        : "outline";

  const tagText = state === "completed"
    ? "已完成"
    : state === "partial"
      ? "部分完成"
      : state === "upcoming"
        ? "待完成"
        : "无安排";

  return (
    <PageCard hero testId="training-focus">
      <div className="eyebrow mb-1">今天 · {day}</div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-title2 font-bold">{headline}</h2>
        <Tag tone={tagTone}>{tagText}</Tag>
      </div>

      {pendingEvents.length > 0 ? (
        <div className="mt-3 space-y-2">
          {pendingEvents.map((pending) => (
            <UpcomingPlan key={pending.event_id} event={pending} onEdit={onPlan} />
          ))}
        </div>
      ) : null}

      {activities.length > 0 ? (
        <div className={pendingEvents.length > 0 ? "mt-3 border-t border-border-subtle pt-3" : ""}>
          {pendingEvents.length > 0 ? (
            <div className="mb-1.5 text-caption1 font-medium text-text-muted">今日已记录</div>
          ) : null}
          <CompletedList activities={activities} />
        </div>
      ) : null}

      {state === "unplanned" ? (
        <p className="mt-2 text-caption1 text-text-muted">
          这周还没有给今天编排课表。
          <button type="button" onClick={onPlan} className="tactile ml-1 inline-flex min-h-11 items-center text-accent-strong hover:underline">
            编排今天
          </button>
        </p>
      ) : null}

      <div className="mt-3 border-t border-border-subtle pt-3">
        <TrainingSubjective
          event={event}
          activities={activities}
          wellness={wellness}
          wellnessLoading={wellnessLoading}
          wellnessError={wellnessError}
          onRetryWellness={onRetryWellness}
          day={day}
          onSaved={onSaved}
          compact
        />
      </div>
      <Link href="/" className="mt-2 inline-flex min-h-11 items-center text-caption1 text-accent-strong hover:underline">
        查看今天的训练建议
      </Link>
    </PageCard>
  );
}

function CompletedList({ activities }: { readonly activities: readonly ActivitySummary[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {activities.map((activity) => (
        <li key={activity.activity_id} className="rounded-xl bg-surface-overlay/60 p-3">
          <Link href={`/activities/${activity.activity_id}`} className="text-subheadline font-medium hover:underline">
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

function UpcomingPlan({ event, onEdit }: { readonly event: CalendarEventDTO; readonly onEdit: () => void }) {
  const prescription = event.workout_prescription;
  const pace = prescription?.pace_min_s_km != null && prescription.pace_max_s_km != null
    ? `${formatPaceFromSeconds(prescription.pace_min_s_km)}–${formatPaceFromSeconds(prescription.pace_max_s_km)}/km`
    : null;
  return (
    <div className="rounded-xl bg-surface-overlay/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-subheadline font-medium">{event.name || "计划训练"}</div>
        <button
          type="button"
          onClick={onEdit}
          className="tactile inline-flex min-h-11 items-center text-caption1 text-accent-strong hover:underline"
        >
          调整课表
        </button>
      </div>
      <div className="num mt-1 flex flex-wrap gap-3 text-caption1 text-text-secondary">
        <span>{prescription ? `${Math.round(prescription.duration_min)} min` : "时长未记录"}</span>
        {event.predicted_distance_m != null ? <span>{(event.predicted_distance_m / 1000).toFixed(1)} km</span> : null}
        {pace ? <span>{pace}</span> : null}
        <span>预计 TSS {event.predicted_tss != null ? Math.round(event.predicted_tss) : NO_VALUE}</span>
      </div>
      {prescription?.display_line ? (
        <p className="mt-1.5 text-caption1 text-text-muted">{prescription.display_line}</p>
      ) : null}
    </div>
  );
}
