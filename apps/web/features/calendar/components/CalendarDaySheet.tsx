"use client";

import { useState } from "react";
import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@shared/ui/sheet";
import { DayReviewSection } from "./DayReviewSection";
import { WorkoutBuilderV2 } from "@features/calendar/components/WorkoutBuilderV2";
import { ManualActivityForm } from "@features/activity/components/ManualActivityForm";
import { SlidingIndicator } from "@shared/ui/SlidingIndicator";
import { strengthLogUrl } from "@shared/config/training-nav";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import type { ActivitySummary } from "@shared/types/activity";
import type { WellnessPoint } from "@features/health/hooks/useWellness";

export type DaySheetMode = "review" | "log" | "plan";

interface CalendarDaySheetProps {
  selectedDate: string | null;
  today: string;
  returnTo: string;
  activities: readonly ActivitySummary[];
  editingEvent: CalendarEventDTO | undefined;
  events?: readonly CalendarEventDTO[];
  initialMode?: DaySheetMode;
  defaultSport?: string;
  wellness: WellnessPoint | null;
  wellnessLoading: boolean;
  wellnessError: string | null;
  onRetryWellness: () => void;
  onSave: () => void;
  onClose: () => void;
  onActivitySaved: () => void;
}

const MODES: readonly { key: DaySheetMode; label: string }[] = [
  { key: "review", label: "回顾" },
  { key: "log", label: "补录" },
  { key: "plan", label: "编排" },
];

export function CalendarDaySheet({
  selectedDate,
  today,
  returnTo,
  activities,
  editingEvent,
  events,
  initialMode,
  defaultSport = "Run",
  wellness,
  wellnessLoading,
  wellnessError,
  onRetryWellness,
  onSave,
  onClose,
  onActivitySaved,
}: CalendarDaySheetProps) {
  const dayEvents = events?.length ? events : editingEvent ? [editingEvent] : [];
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const creatingPlan = selectedEventId === "__new__";
  const activeEvent = creatingPlan
    ? undefined
    : (dayEvents.find((item) => item.event_id === selectedEventId) ?? dayEvents[0]);
  const hasActivities = activities.length > 0;

  const title = !selectedDate ? "" : hasActivities ? `${selectedDate} 训练详情` : activeEvent ? `编辑计划 · ${selectedDate}` : `新建训练 · ${selectedDate}`;

  // 空白日打开「编排」；已有课表或活动的日期打开「回顾」。
  const defaultMode: DaySheetMode = initialMode ?? (hasActivities || dayEvents.length > 0 ? "review" : "plan");
  const [modeByDate, setMode] = useState<{ date: string; mode: DaySheetMode }>(
    selectedDate ? { date: selectedDate, mode: defaultMode } : { date: "", mode: "review" },
  );
  const [prevSession, setPrevSession] = useState<string>("");
  const sessionKey = `${selectedDate ?? ""}:${initialMode ?? ""}`;
  let mode: DaySheetMode = selectedDate != null && modeByDate.date === selectedDate ? modeByDate.mode : defaultMode;
  if (sessionKey !== prevSession) {
    setPrevSession(sessionKey);
    if (selectedDate != null) {
      setMode({ date: selectedDate, mode: defaultMode });
      setSelectedEventId(null);
    }
    mode = selectedDate != null ? defaultMode : mode;
  }

  const switchMode = (nextMode: DaySheetMode) =>
    setMode(selectedDate != null ? { date: selectedDate, mode: nextMode } : { date: modeByDate.date, mode: nextMode });

  return (
    <Sheet
      open={selectedDate != null}
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <SheetContent
        side="bottom"
        className="rounded-t-3xl sm:inset-x-auto sm:left-1/2 sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:-translate-x-1/2"
      >
        {selectedDate ? (
          <>
            <SheetHeader className="sticky top-0 z-10 border-b border-border-subtle bg-surface-card">
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
                    onClick={() => switchMode(entry.key)}
                    className={`tactile relative z-10 flex min-h-11 flex-1 items-center justify-center rounded-full px-3 text-subheadline font-medium ${mode === entry.key ? "text-text-primary" : "text-text-muted"}`}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>

              {(dayEvents.length > 1 || (dayEvents.length > 0 && mode === "plan")) && mode !== "log" ? (
                <div className="flex flex-wrap items-center gap-1.5" aria-label="切换当日课表">
                  {dayEvents.map((ev, index) => (
                    <button
                      key={ev.event_id}
                      type="button"
                      onClick={() => setSelectedEventId(ev.event_id)}
                      aria-pressed={!creatingPlan && activeEvent?.event_id === ev.event_id}
                      className={`tactile min-h-11 rounded-full border px-3 text-caption1 ${
                        !creatingPlan && activeEvent?.event_id === ev.event_id
                          ? "border-accent bg-accent/15 text-accent-strong"
                          : "border-border-default text-text-muted"
                      }`}
                    >
                      {ev.name || `课表 ${index + 1}`}
                    </button>
                  ))}
                  {mode === "plan" ? (
                    <button
                      type="button"
                      onClick={() => setSelectedEventId("__new__")}
                      aria-pressed={creatingPlan}
                      className={`tactile min-h-11 rounded-full border px-3 text-caption1 ${
                        creatingPlan ? "border-accent bg-accent/15 text-accent-strong" : "border-border-default text-text-muted"
                      }`}
                    >
                      + 新增课表
                    </button>
                  ) : null}
                </div>
              ) : null}

              {mode === "review" ? (
                <DayReviewSection
                  activities={activities}
                  editingEvent={activeEvent}
                  day={selectedDate}
                  today={today}
                  returnTo={returnTo}
                  events={dayEvents}
                  wellness={wellness}
                  wellnessLoading={wellnessLoading}
                  wellnessError={wellnessError}
                  onRetryWellness={onRetryWellness}
                  onSave={onSave}
                  onSwitchMode={switchMode}
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
                      activeEvent?.status === "planned" && !activeEvent.done
                        ? activeEvent.event_id
                        : undefined
                    }
                    onSaved={() => {
                      onActivitySaved();
                      onClose();
                    }}
                    onStrengthNavigate={onClose}
                  />
                  <Link
                    href={strengthLogUrl(selectedDate)}
                    onClick={onClose}
                    data-testid="day-log-strength"
                    className="tactile flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border-subtle px-3 py-2.5 text-caption1 text-text-secondary hover:bg-surface-overlay"
                  >
                    <span>记录当日力量训练（动作与组数）</span>
                    <span className="shrink-0 font-medium text-accent-strong">前往力量工作台 →</span>
                  </Link>
                </section>
              ) : null}

              {mode === "plan" ? (
                <section className="flex flex-col gap-3" aria-label="计划训练">
                  {hasActivities ? (
                    <h3 className="text-caption1 font-semibold text-text-muted">计划</h3>
                  ) : null}
                  <WorkoutBuilderV2
                    key={`${selectedDate}:${activeEvent?.event_id ?? "new"}`}
                    date={selectedDate}
                    allowDateEdit
                    defaultSport={defaultSport}
                    event={activeEvent}
                    onSave={() => { onSave(); onClose(); }}
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
