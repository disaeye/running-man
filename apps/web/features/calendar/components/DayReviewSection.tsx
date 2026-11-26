"use client";

import { Button } from "@shared/ui/button";
import { DayActivitySummary } from "@features/calendar/components/DayActivitySummary";
import { DayPlanActual } from "@features/calendar/components/DayPlanActual";
import { EventLinkSection } from "@features/calendar/components/EventLinkSection";
import { PlanPacePrescription } from "@features/calendar/components/PlanPacePrescription";
import { DaySubjectiveSection } from "./DaySubjectiveSection";
import type { DaySheetMode } from "./CalendarDaySheet";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import type { ActivitySummary } from "@shared/types/activity";
import type { WellnessPoint } from "@features/health/hooks/useWellness";

export interface DayReviewProps {
  readonly activities: readonly ActivitySummary[];
  readonly editingEvent: CalendarEventDTO | undefined;
  readonly day: string;
  readonly today: string;
  readonly returnTo: string;
  readonly events: readonly CalendarEventDTO[];
  readonly wellness: WellnessPoint | null;
  readonly wellnessLoading: boolean;
  readonly wellnessError: string | null;
  readonly onRetryWellness: () => void;
  readonly onSave: () => void;
  readonly onSwitchMode: (mode: DaySheetMode) => void;
}

export function DayReviewSection({
  activities, editingEvent, day, today, events, returnTo,
  wellness, wellnessLoading, wellnessError, onRetryWellness, onSave, onSwitchMode,
}: DayReviewProps) {
  if (activities.length === 0 && !editingEvent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-overlay/40 p-6 text-center">
        <p className="text-subheadline text-text-secondary">当天暂无训练记录或计划课表</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="secondary" onClick={() => onSwitchMode("log")}>记录实际训练</Button>
          <Button type="button" variant="outline" onClick={() => onSwitchMode("plan")}>编排训练计划</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {activities.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="实际训练">
          <h3 className="text-caption1 font-semibold text-text-muted">实际</h3>
          {activities.map((activity) => (
            <DayActivitySummary key={activity.activity_id} activity={activity} returnTo={returnTo} />
          ))}
        </section>
      ) : null}
      {editingEvent?.training_type === "race" ? (
        <section className="rounded-lg border border-accent/30 bg-accent/5 p-3" aria-label="比赛日">
          <h3 className="text-subheadline font-semibold text-accent-strong">比赛日</h3>
          <p className="mt-1 text-caption1 text-text-secondary">{editingEvent.name ?? "目标比赛"} · 记录比赛实绩时可关联此日期。</p>
        </section>
      ) : null}
      {editingEvent ? <PlanPacePrescription event={editingEvent} /> : null}
      <DayPlanActual event={editingEvent} activities={activities} />
      {editingEvent && editingEvent.status !== "deleted" ? (
        <EventLinkSection event={editingEvent} activities={activities} onSaved={onSave} />
      ) : null}
      <DaySubjectiveSection
        day={day}
        today={today}
        events={events}
        activities={activities}
        wellness={wellness}
        wellnessLoading={wellnessLoading}
        wellnessError={wellnessError}
        onRetryWellness={onRetryWellness}
        onSaved={onSave}
      />
    </>
  );
}
