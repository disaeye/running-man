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
import { DayPlanActual } from "@features/calendar/components/DayPlanActual";
import { EventLinkSection } from "@features/calendar/components/EventLinkSection";
import { ManualActivityForm } from "@features/activity/components/ManualActivityForm";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import type { ActivitySummary } from "@shared/types/activity";

interface CalendarDaySheetProps {
  selectedDate: string | null;
  activities: readonly ActivitySummary[];
  editingEvent: CalendarEventDTO | undefined;
  defaultSport?: string;
  onSave: () => void;
  onClose: () => void;
  onActivitySaved: () => void;
}

/**
 * 单日详情抽屉：同时展示当日实际活动、结构化处方、Plan vs Actual 对照、补录与计划编排。
 * 保存或删除计划后触发刷新并关闭抽屉，形成清晰操作闭环。
 */
export function CalendarDaySheet({
  selectedDate,
  activities,
  editingEvent,
  defaultSport = "Run",
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
        {selectedDate ? (
          <>
            <SheetHeader>
              <SheetTitle className="text-body font-semibold">{title}</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-5 px-4 pb-6">
              {hasActivities ? (
                <section className="flex flex-col gap-3" aria-label="实际训练">
                  <h3 className="text-caption1 font-semibold text-text-muted">实际</h3>
                  {activities.map((activity) => (
                    <DayActivitySummary key={activity.activity_id} activity={activity} />
                  ))}
                </section>
              ) : null}

              {editingEvent?.training_type === "race" ? (
                <section className="rounded-lg border border-accent/30 bg-accent/5 p-3" aria-label="比赛日">
                  <h3 className="text-subheadline font-semibold text-accent-strong">比赛日</h3>
                  <p className="mt-1 text-caption1 text-text-secondary">
                    {editingEvent.name ?? "目标比赛"} · 记录比赛实绩时可关联此日期。
                  </p>
                </section>
              ) : null}
              {editingEvent ? <PlanPacePrescription event={editingEvent} /> : null}

              <DayPlanActual event={editingEvent} activities={activities} />

              {editingEvent && editingEvent.status !== "deleted" ? (
                <EventLinkSection event={editingEvent} activities={activities} onSaved={onSave} />
              ) : null}

              <section className="flex flex-col gap-3" aria-label="记录实际训练">
                <h3 className="text-caption1 font-semibold text-text-muted">
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
                {hasActivities ? (
                  <h3 className="text-caption1 font-semibold text-text-muted">计划</h3>
                ) : null}
                <WorkoutBuilderV2
                  key={`${selectedDate}:${editingEvent?.event_id ?? "new"}`}
                  date={selectedDate}
                  defaultSport={defaultSport}
                  event={editingEvent}
                  onSave={() => {
                    onSave();
                    onClose();
                  }}
                  onClose={onClose}
                />
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
