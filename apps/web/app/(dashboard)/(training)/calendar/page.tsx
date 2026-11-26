"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSWRConfig } from "swr";
import { useActivities } from "@features/activity/hooks/useActivities";
import { useCalendarEvents } from "@features/calendar/hooks/useCalendarEvents";
import { invalidateDataCards } from "@features/data/lib/invalidate-after-sync";
import { useWellness } from "@features/health/hooks/useWellness";
import { activityLocalDay, athleteToday, useAthleteTimezoneState } from "@shared/lib/training-day";
import { CalendarDaySheet, type DaySheetMode } from "@features/calendar/components/CalendarDaySheet";
import { CalendarViewSwitch } from "@features/calendar/components/CalendarViewSwitch";
import { TrainingFamilyFilter } from "@features/calendar/components/TrainingFamilyFilter";
import { TrainingViewPanels } from "@features/calendar/components/TrainingViewPanels";
import { getSportConfig, isProductSport } from "@shared/config/sport-config";
import { resolveCalendarView } from "@features/calendar/lib/calendar-view";
import {
  buildCalendarUrl,
  dailyTss,
  parseCalendarDateParam,
  parseSportFamilyParam,
} from "@features/calendar/lib/calendar-url-state";
import { buildWeekModel, eventFamily, monthLabel, periodLabel, type WeekModel } from "@features/calendar/lib/training-week";
import { monthRangeOf, monthScaleRangeOf, viewRange, weekRangeOf } from "@features/calendar/lib/view-range";
import { defaultSportForFamily } from "@features/calendar/lib/workout-prescription";

/**
 * 日历只回答「什么时候练、练了没有」：周历与月历两种视图，`?date=` 是锚点日，
 * `?view=` 与 `?sport=` 分别控制视图与运动家族。完整历史记录在「记录」页。
 */
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
  const { mutate } = useSWRConfig();
  const { timezone, resolved } = useAthleteTimezoneState();
  const params = new URLSearchParams(searchParams.toString());
  const view = resolveCalendarView(params.get("view"));
  const family = parseSportFamilyParam(params.get("sport"));
  const today = athleteToday(timezone);
  const explicitAnchor = parseCalendarDateParam(params.get("date"));
  const displayAnchor = explicitAnchor ?? today;
  const anchor = resolved ? displayAnchor : "";
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [sheetMode, setSheetMode] = useState<DaySheetMode | undefined>(undefined);

  const range = useMemo(
    () => (resolved ? viewRange(view, anchor) : { from: "", to: "" }),
    [resolved, view, anchor],
  );
  const displayWeek = useMemo(() => weekRangeOf(displayAnchor), [displayAnchor]);
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
    () => activities.data.filter((a) => {
      if (family !== "all") return getSportConfig(a.sport).family === family;
      return isProductSport(a.sport);
    }),
    [activities.data, family],
  );
  const scopedEvents = useMemo(
    () =>
      events.events.filter(
        (e) => {
          if (e.status === "deleted") return false;
          const category = eventFamily(e);
          return category === "all" || (family === "all" ? category === "running" || category === "strength" : category === family);
        },
      ),
    [events.events, family],
  );
  const periodRange = useMemo(
    () => view === "month" && resolved ? monthRangeOf(anchor.slice(0, 7)) : range,
    [view, resolved, anchor, range],
  );
  const model: WeekModel = useMemo(
    () => buildWeekModel({
      activities: scopedActivities,
      events: scopedEvents,
      timezone,
      from: periodRange.from,
      to: periodRange.to,
      today,
      family,
      includeEmptyDays: view === "week",
    }),
    [scopedActivities, scopedEvents, timezone, periodRange, today, family, view],
  );

  const isCurrentPeriod = view === "week"
    ? displayWeek.from <= today && today <= displayWeek.to
    : displayAnchor.slice(0, 7) === today.slice(0, 7);
  const periodTitle = view === "week"
    ? `${isCurrentPeriod ? "本周" : "该周"} · ${periodLabel(displayWeek.from, displayWeek.to)}`
    : monthLabel(displayAnchor.slice(0, 7));
  const loading = (activities.loading && activities.data.length === 0) || (events.loading && events.events.length === 0);
  const error = activities.error ?? events.error;
  const planDate = isCurrentPeriod ? today : view === "week" ? displayWeek.from : `${displayAnchor.slice(0, 7)}-01`;

  const patchUrl = (patch: Parameters<typeof buildCalendarUrl>[1]) =>
    router.replace(buildCalendarUrl(params, patch), { scroll: false });
  const reloadAll = () => {
    activities.reload();
    events.reload();
    wellness.reload();
    void invalidateDataCards(mutate);
  };
  const openDaySheet = (day: string, mode?: DaySheetMode) => {
    setSheetMode(mode);
    setEditingDate(day);
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
    <div className="space-y-4" data-testid="training-calendar-page">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TrainingFamilyFilter family={family} onChange={(next) => patchUrl({ family: next })} />
        <p className="num text-caption1 text-text-muted" data-testid="calendar-period-title">
          {periodTitle}
        </p>
      </div>
      <TrainingViewPanels
        view={view}
        resolved={resolved}
        loading={loading}
        error={error}
        model={model}
        today={today}
        anchor={anchor}
        timezone={timezone}
        scopedActivities={scopedActivities}
        scopedEvents={scopedEvents}
        scaleDays={scaleDays}
        isCurrentPeriod={isCurrentPeriod}
        viewControl={<CalendarViewSwitch view={view} onChange={(next) => patchUrl({ view: next })} />}
        onAnchorChange={(date) => patchUrl({ date })}
        onSelectDate={openDaySheet}
        onPlanPeriod={() => openDaySheet(planDate, "plan")}
        onRetry={reloadAll}
      />

      <CalendarDaySheet
        selectedDate={editingDate}
        today={today}
        returnTo={params.size ? `/calendar?${params}` : "/calendar"}
        activities={selectedActivities}
        editingEvent={selectedEvents[0]}
        events={selectedEvents}
        initialMode={sheetMode}
        defaultSport={defaultSportForFamily(family)}
        wellness={wellness.data[0] ?? null}
        wellnessLoading={wellness.loading}
        wellnessError={wellness.error}
        onRetryWellness={() => void wellness.reload()}
        onSave={reloadAll}
        onClose={() => { setEditingDate(null); setSheetMode(undefined); }}
        onActivitySaved={reloadAll}
      />
    </div>
  );
}
