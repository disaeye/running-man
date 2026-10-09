"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@shared/ui/sheet";
import { WorkoutBuilderV2 } from "@features/calendar/components/WorkoutBuilderV2";
import { DayActivitySummary } from "@features/calendar/components/DayActivitySummary";
import { PlanPacePrescription } from "@features/calendar/components/PlanPacePrescription";
import { ManualActivityForm } from "@features/activity/components/ManualActivityForm";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import type { ActivitySummary } from "@shared/types/activity";

interface CalendarDaySheetProps {
  /** ISO date string; when null the sheet stays closed. */
  selectedDate: string | null;
  /** Completed activities for the selected day (may be empty). */
  activities: readonly ActivitySummary[];
  /** Existing event being edited, if any. */
  editingEvent: CalendarEventDTO | undefined;
  /** Fired after the builder saves; closes the sheet and triggers a refresh upstream. */
  onSave: () => void;
  /** Fired when the user dismisses the sheet (overlay tap, close button, escape). */
  onClose: () => void;
  onActivitySaved: () => void;
}

/**
 * Bottom sheet for a calendar day: completed sessions and plan builder together
 * so planned vs actual can be compared on the same screen.
 */
export function CalendarDaySheet({
  selectedDate,
  activities,
  editingEvent,
  onSave,
  onClose,
  onActivitySaved,
}: CalendarDaySheetProps) {
  const hasActivities = activities.length > 0;
  const title = !selectedDate
    ? ""
    : hasActivities
      ? `${selectedDate} 训练详情`
      : editingEvent
        ? `编辑计划 · ${selectedDate}`
        : `新建训练 · ${selectedDate}`;

  return (
    <Sheet
      open={selectedDate != null}
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <SheetContent
        side="bottom"
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-t-[22px] sm:max-w-lg sm:mx-auto"
      >
        {selectedDate && (
          <>
            <SheetHeader>
              <SheetTitle className="text-body font-semibold">{title}</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-5 px-4 pb-6">
              {hasActivities && (
                <section className="flex flex-col gap-3" aria-label="实际训练">
                  <h3 className="text-caption1 font-semibold uppercase tracking-wider text-text-muted">
                    实际
                  </h3>
                  {activities.map((activity) => (
                    <DayActivitySummary key={activity.activity_id} activity={activity} />
                  ))}
                </section>
              )}

              {editingEvent?.training_type === "race" && (
                <section className="rounded-lg border border-accent/30 bg-accent/5 p-3" aria-label="比赛日">
                  <h3 className="text-subheadline font-semibold text-accent-strong">比赛日</h3>
                  <p className="mt-1 text-caption1 text-text-secondary">
                    {editingEvent.name ?? "目标比赛"} · 记录比赛实绩时可关联此日期。
                  </p>
                </section>
              )}
              {editingEvent && <PlanPacePrescription event={editingEvent} />}

              <section className="flex flex-col gap-3" aria-label="记录实际训练">
                <h3 className="text-caption1 font-semibold uppercase tracking-wider text-text-muted">
                  {hasActivities ? "补录训练" : "记录实际训练"}
                </h3>
                <ManualActivityForm
                  key={selectedDate}
                  initialDate={selectedDate}
                  eventId={
                    editingEvent?.status === "planned" && !editingEvent.done
                      ? editingEvent.event_id
                      : undefined
                  }
                  onSaved={() => {
                    onActivitySaved();
                    onClose();
                  }}
                />
              </section>

              <section className="flex flex-col gap-3" aria-label="计划训练">
                {hasActivities && (
                  <h3 className="text-caption1 font-semibold uppercase tracking-wider text-text-muted">
                    计划
                  </h3>
                )}
                <WorkoutBuilderV2
                  date={selectedDate}
                  event={editingEvent}
                  onSave={onSave}
                  onClose={onClose}
                />
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
