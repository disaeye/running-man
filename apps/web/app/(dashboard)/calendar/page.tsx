"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Page } from "@shared/ui/Lovable";
import { SlidingIndicator } from "@shared/ui/SlidingIndicator";
import { useActivities } from "@features/activity/hooks/useActivities";
import { useCalendarEvents } from "@features/calendar/hooks/useCalendarEvents";
import {
  activityLocalDay,
  athleteToday,
  useAthleteTimezoneState,
} from "@shared/lib/training-day";
import { CalendarDaySheet } from "@features/calendar/components/CalendarDaySheet";
import { TrainingAddSheet } from "@features/calendar/components/TrainingAddSheet";
import { TrainingViewPanels } from "@features/calendar/components/TrainingViewPanels";
import { LIST_WINDOW_DAYS } from "@features/calendar/components/TrainingActivityList";
import { useWellness } from "@features/health/hooks/useWellness";
import { CALENDAR_VIEWS, resolveCalendarView } from "@features/calendar/lib/calendar-view";
import {
  monthScaleRangeOf,
  shiftMonth,
  viewRange,
  weekRangeOf,
} from "@features/calendar/lib/view-range";
import {
  buildWeekModel,
  listLabel,
  monthLabel,
  periodLabel,
  type WeekModel,
} from "@features/calendar/lib/training-week";
import { getSportConfig, type SportFamily } from "@shared/config/sport-config";

const VIEW_LABELS = { week: "本周", month: "负荷", list: "流水" } as const;
const SPORT_FILTERS: readonly { key: SportFamily | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "running", label: "跑步" },
  { key: "strength", label: "力量训练" },
];

/** `?view=` 是视图的唯一来源：链接可分享，浏览器后退可用。 */
export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <TrainingPageContent />
    </Suspense>
  );
}

function TrainingPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const view = resolveCalendarView(searchParams.get("view"));
  const setView = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("view", next);
    router.replace(`/calendar?${params.toString()}`);
  };
  const [family, setFamily] = useState<SportFamily | "all">("all");
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [listDays, setListDays] = useState(LIST_WINDOW_DAYS);
  const { timezone, resolved } = useAthleteTimezoneState();
  const today = athleteToday(timezone);
  const month = shiftMonth(today.slice(0, 7), monthOffset);
  const currentWeek = useMemo(() => weekRangeOf(today), [today]);

  const range = useMemo(
    () => (resolved
      ? viewRange(view, today, weekOffset, month, listDays)
      : { from: "", to: "" }),
    [resolved, view, today, weekOffset, month, listDays],
  );
  const activities = useActivities(range.from, range.to);
  const events = useCalendarEvents(range.from, range.to);
  const wellness = useWellness(resolved ? today : "", resolved ? today : "");

  const scaleRange = useMemo(() => monthScaleRangeOf(today), [today]);
  const scaleActivities = useActivities(
    view === "month" && resolved ? scaleRange.from : "",
    view === "month" && resolved ? scaleRange.to : "",
  );
  const scaleDays = useMemo(
    () => dailyTss(scaleActivities.data, timezone),
    [scaleActivities.data, timezone],
  );

  const scopedActivities = useMemo(
    () => activities.data.filter((activity) =>
      family === "all" || getSportConfig(activity.sport).family === family),
    [activities.data, family],
  );
  const scopedEvents = useMemo(
    () => events.events.filter((event) =>
      family === "all" || eventFamily(event) === family || eventFamily(event) === "all"),
    [events.events, family],
  );

  const model: WeekModel = useMemo(
    () => buildWeekModel({
      activities: scopedActivities,
      events: scopedEvents,
      timezone,
      from: range.from || currentWeek.from,
      to: range.to || currentWeek.to,
      today,
      family,
    }),
    [scopedActivities, scopedEvents, timezone, range.from, range.to, currentWeek.from, currentWeek.to, today, family],
  );

  const todayEvent = scopedEvents.find((event) =>
    activityLocalDay(event.start_time, timezone) === today) ?? null;
  const isCurrentWeek = weekOffset === 0;
  const eyebrow = view === "week"
    ? `${isCurrentWeek ? "本周" : "该周"} · ${periodLabel(model.comparison.from, model.comparison.to)}`
    : view === "month" ? monthLabel(month) : listLabel(listDays);

  const switchView = (next: string) => {
    setWeekOffset(0);
    setMonthOffset(0);
    setView(next);
  };
  const reloadAll = () => {
    activities.reload();
    events.reload();
    wellness.reload();
  };
  const selectedItems = editingDate
    ? model.days.find((item) => item.day === editingDate)
    : undefined;

  return (
    <Page
      title="训练"
      eyebrow={eyebrow}
      right={
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          aria-label="添加训练"
          className="tactile flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      }
    >
      {view !== "list" ? (
        <div className="relative flex flex-wrap gap-2">
          <SlidingIndicator
            variant="underline"
            options={SPORT_FILTERS.map((option) => ({ key: option.key, selected: family === option.key }))}
          />
          {SPORT_FILTERS.map((option) => (
            <button
              type="button"
              key={option.key}
              data-indicator-key={option.key}
              onClick={() => setFamily(option.key)}
              aria-pressed={family === option.key}
              className={`tactile relative z-10 inline-flex min-h-11 items-center rounded-full border px-3.5 text-xs ${family === option.key ? "border-primary bg-primary/15 text-accent-strong" : "border-border-default text-text-muted"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative flex rounded-full bg-secondary p-1" role="tablist">
        <SlidingIndicator
          variant="accent-pill"
          options={CALENDAR_VIEWS.map((value) => ({ key: value, selected: view === value }))}
        />
        {CALENDAR_VIEWS.map((value) => (
          <button
            type="button"
            key={value}
            data-indicator-key={value}
            role="tab"
            aria-selected={view === value}
            onClick={() => switchView(value)}
            className={`tactile relative z-10 inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-transparent px-3 text-xs font-medium ${view === value ? "text-primary-foreground" : "text-text-muted hover:text-text-primary"}`}
          >
            {VIEW_LABELS[value]}
          </button>
        ))}
      </div>

      <TrainingViewPanels
        view={view}
        resolved={resolved}
        model={model}
        today={today}
        month={month}
        timezone={timezone}
        listDays={listDays}
        activities={activities.data}
        scopedActivities={scopedActivities}
        scopedEvents={scopedEvents}
        todayEvent={todayEvent}
        wellness={wellness.data[0] ?? null}
        scaleDays={scaleDays}
        isCurrentWeek={isCurrentWeek}
        onWeekChange={(delta) => setWeekOffset((value) => value + delta)}
        onMonthChange={(delta) => setMonthOffset((value) => value + delta)}
        onLoadEarlier={() => setListDays((value) => value + LIST_WINDOW_DAYS)}
        onSelectDate={setEditingDate}
        onPlanToday={() => setEditingDate(today)}
        onSaved={reloadAll}
      />

      <TrainingAddSheet
        open={addOpen}
        date={today}
        onOpenChange={setAddOpen}
        onSaved={reloadAll}
      />
      <CalendarDaySheet
        selectedDate={editingDate}
        activities={selectedItems?.activities ?? []}
        editingEvent={selectedItems?.events[0]}
        onSave={reloadAll}
        onClose={() => setEditingDate(null)}
        onActivitySaved={reloadAll}
      />
    </Page>
  );
}

function eventFamily(event: { readonly sport_type?: string }): SportFamily | "all" {
  if (!event.sport_type) return "all";
  const family = getSportConfig(event.sport_type).family;
  return family === "unknown" ? "all" : family;
}

function dailyTss(
  activities: readonly { readonly start_time: string; readonly tss?: number | null }[],
  timezone: string,
): number[] {
  const byDay = new Map<string, number>();
  for (const activity of activities) {
    const day = activityLocalDay(activity.start_time, timezone);
    byDay.set(day, (byDay.get(day) ?? 0) + (activity.tss ?? 0));
  }
  return [...byDay.values()];
}
