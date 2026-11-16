"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarFab } from "@features/calendar/components/CalendarFab";
import { Page } from "@shared/ui/Lovable";
import { useActivities } from "@features/activity/hooks/useActivities";
import { useCalendarEvents } from "@features/calendar/hooks/useCalendarEvents";
import { activityLocalDay, athleteToday, useAthleteTimezoneState } from "@shared/lib/training-day";
import { CalendarDaySheet } from "@features/calendar/components/CalendarDaySheet";
import { TrainingAddSheet } from "@features/calendar/components/TrainingAddSheet";
import { TrainingFilterTabs } from "@features/calendar/components/TrainingFilterTabs";
import { TrainingViewPanels } from "@features/calendar/components/TrainingViewPanels";
import { LIST_WINDOW_DAYS } from "@features/calendar/components/TrainingActivityList";
import { PlanGenerateDialog } from "@features/plan/components/PlanGenerateDialog";
import { useWellness } from "@features/health/hooks/useWellness";
import { resolveCalendarView, type CalendarView } from "@features/calendar/lib/calendar-view";
import { monthScaleRangeOf, shiftMonth, viewRange, weekRangeOf } from "@features/calendar/lib/view-range";
import { buildWeekModel, eventFamily, listLabel, monthLabel, periodLabel, type WeekModel } from "@features/calendar/lib/training-week";
import { defaultSportForFamily } from "@features/calendar/lib/workout-prescription";
import { getSportConfig, type SportFamily } from "@shared/config/sport-config";

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
  const setView = (next: CalendarView) => {
    const params = new URLSearchParams(searchParams);
    params.set("view", next);
    router.replace(`/calendar?${params.toString()}`);
  };
  const [family, setFamily] = useState<SportFamily | "all">("all");
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [listDays, setListDays] = useState(LIST_WINDOW_DAYS);
  const { timezone, resolved } = useAthleteTimezoneState();
  const today = athleteToday(timezone);
  const month = shiftMonth(today.slice(0, 7), monthOffset);
  const currentWeek = useMemo(() => weekRangeOf(today), [today]);

  const range = useMemo(
    () => (resolved ? viewRange(view, today, weekOffset, month, listDays) : { from: "", to: "" }),
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
  const scaleDays = useMemo(() => dailyTss(scaleActivities.data, timezone), [scaleActivities.data, timezone]);

  const scopedActivities = useMemo(
    () => activities.data.filter((a) => family === "all" || getSportConfig(a.sport).family === family),
    [activities.data, family],
  );
  const scopedEvents = useMemo(
    () => events.events.filter((e) => family === "all" || eventFamily(e) === family || eventFamily(e) === "all"),
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

  const todayEvent = scopedEvents.find((e) => activityLocalDay(e.start_time, timezone) === today) ?? null;
  const isCurrentWeek = weekOffset === 0;
  const viewLoading = view === "list"
    ? activities.loading && activities.data.length === 0
    : (activities.loading && activities.data.length === 0) || (events.loading && events.events.length === 0);
  const viewError = view === "list" ? activities.error : activities.error ?? events.error;
  const eyebrow = view === "week"
    ? `${isCurrentWeek ? "本周" : "该周"} · ${periodLabel(model.comparison.from, model.comparison.to)}`
    : view === "month" ? monthLabel(month) : listLabel(listDays);

  const defaultAddDate = view === "week" && !isCurrentWeek
    ? model.comparison.from
    : view === "month" && month !== today.slice(0, 7)
      ? `${month}-01`
      : today;
  const defaultSport = defaultSportForFamily(family);

  const switchView = (next: CalendarView) => {
    setWeekOffset(0);
    setMonthOffset(0);
    setView(next);
  };
  const reloadAll = () => {
    activities.reload();
    events.reload();
    wellness.reload();
  };

  const selectedActivities = useMemo(
    () => (editingDate ? scopedActivities.filter((a) => activityLocalDay(a.start_time, timezone) === editingDate) : []),
    [editingDate, scopedActivities, timezone],
  );
  const selectedEvents = useMemo(
    () => (editingDate ? scopedEvents.filter((e) => e.status !== "deleted" && activityLocalDay(e.start_time, timezone) === editingDate) : []),
    [editingDate, scopedEvents, timezone],
  );

  return (
    <Page title="训练" eyebrow={eyebrow}>
      <TrainingFilterTabs view={view} family={family} onFamilyChange={setFamily} onViewChange={switchView} />

      <TrainingViewPanels
        view={view}
        resolved={resolved}
        loading={viewLoading}
        error={viewError}
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
        wellnessLoading={wellness.loading}
        wellnessError={wellness.error}
        scaleDays={scaleDays}
        isCurrentWeek={isCurrentWeek}
        weekOffset={weekOffset}
        onWeekChange={(delta) => setWeekOffset((value) => value + delta)}
        onMonthChange={(delta) => setMonthOffset((value) => value + delta)}
        onLoadEarlier={() => setListDays((value) => value + LIST_WINDOW_DAYS)}
        onSelectDate={setEditingDate}
        onPlanToday={() => setEditingDate(today)}
        onPlanWeek={() => setEditingDate(model.comparison.from)}
        onGeneratePlan={() => setGenerateOpen(true)}
        onRetry={reloadAll}
        onRetryWellness={wellness.reload}
        onSaved={reloadAll}
      />

      <TrainingAddSheet
        open={addOpen}
        date={defaultAddDate}
        defaultSport={defaultSport}
        onOpenChange={setAddOpen}
        onOpenGenerate={() => setGenerateOpen(true)}
        onSaved={reloadAll}
      />
      <CalendarDaySheet
        selectedDate={editingDate}
        activities={selectedActivities}
        editingEvent={selectedEvents[0]}
        defaultSport={defaultSport}
        onSave={reloadAll}
        onClose={() => setEditingDate(null)}
        onActivitySaved={reloadAll}
      />
      <PlanGenerateDialog open={generateOpen} onClose={() => setGenerateOpen(false)} onGenerated={reloadAll} />
      <CalendarFab onAddAction={() => { setAddOpen(true); }} onGenerateAction={() => setGenerateOpen(true)} />
    </Page>
  );
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
