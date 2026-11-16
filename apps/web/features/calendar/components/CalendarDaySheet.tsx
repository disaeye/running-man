"use client";

import { useState } from "react";
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
import { SlidingIndicator } from "@shared/ui/SlidingIndicator";
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

/** 抽屉顶部的三个模式：回顾看结果，补录写今天，编排改课表。 */
type DaySheetMode = "review" | "log" | "plan";

const MODES: readonly { key: DaySheetMode; label: string }[] = [
  { key: "review", label: "回顾" },
  { key: "log", label: "补录" },
  { key: "plan", label: "编排" },
];

/**
 * 单日详情抽屉：顶部三分段（回顾 / 补录 / 编排），每段只装自己那个问题的
 * 内容——跑完步的状态是单手、想快点记完，补录默认落点因此按「当天没有
 * 记录」决定，而不是永远从回顾滚到底。
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
  // 当天没记录时补录就是来意：默认落「补录」；有记录时先回顾结果。
  const defaultMode: DaySheetMode = hasActivities ? "review" : "log";
  // 模式状态携带它所属的日期：换日期打开抽屉时在渲染期重置一次，
  // 不需要 effect 同步，也不会在旧日期的模式里渲染新日期的内容。
  const [modeByDate, setMode] = useState<{ date: string; mode: DaySheetMode }>(
    selectedDate ? { date: selectedDate, mode: defaultMode } : { date: "", mode: "review" },
  );
  const mode = selectedDate != null && modeByDate.date !== selectedDate
    ? defaultMode
    : modeByDate.mode;

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
              <div role="tablist" aria-label="单日视图" className="relative flex rounded-full bg-secondary p-1">
                <SlidingIndicator
                  variant="surface-pill"
                  options={MODES.map((entry) => ({ key: entry.key, selected: mode === entry.key }))}
                />
                {MODES.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    role="tab"
                    aria-selected={mode === entry.key}
                    data-indicator-key={entry.key}
                    onClick={() => setMode(selectedDate != null ? { date: selectedDate, mode: entry.key } : { date: modeByDate.date, mode: entry.key })}
                    className={`tactile relative z-10 flex min-h-11 flex-1 items-center justify-center rounded-full px-3 text-subheadline font-medium ${mode === entry.key ? "text-text-primary" : "text-text-muted"}`}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>

              {mode === "review" ? (
                <ReviewSection
                  activities={activities}
                  editingEvent={editingEvent}
                  onSave={onSave}
                />
              ) : null}

              {mode === "log" ? (
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
              ) : null}

              {mode === "plan" ? (
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
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** 回顾段：实际结果、比赛横幅、处方、计划实际对照与课表关联。 */
function ReviewSection({
  activities,
  editingEvent,
  onSave,
}: {
  activities: readonly ActivitySummary[];
  editingEvent: CalendarEventDTO | undefined;
  onSave: () => void;
}) {
  const hasActivities = activities.length > 0;
  return (
    <>
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
    </>
  );
}
