"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  canonicalCalendarSearch,
  calendarViewUrl,
} from "@shared/config/canonical-routes";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { listEventsApiV1CalendarGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";
import { activityLocalDay, athleteToday, useAthleteTimezone } from "@shared/lib/training-day";
import { useActivities } from "@features/activity/hooks/useActivities";
import { invalidateDataCards } from "@features/data/lib/invalidate-after-sync";
import { useSWRConfig } from "swr";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import {
  parseViewParam,
  decideDateClickOutcome,
  getMonday,
  type CalendarView,
} from "@/app/(dashboard)/calendar/calendar-view";

interface UseCalendarPageReturn {
  view: CalendarView;
  handleSetView: (nextView: CalendarView) => void;
  weekStart: Date;
  monthDate: Date;
  events: CalendarEventDTO[];
  selectedDate: string | null;
  setSelectedDate: (date: string | null) => void;
  editingEvent: CalendarEventDTO | undefined;
  generateOpen: boolean;
  setGenerateOpen: (open: boolean) => void;
  activityMap: Map<string, ActivitySummary[]>;
  isGridView: boolean;
  loading: boolean;
  error: string | null;
  activitiesError: string | null;
  navWeek: (delta: number) => void;
  navMonth: (delta: number) => void;
  handleSelectDate: (iso: string) => void;
  handleBuilderSave: () => void;
  handleActivitySaved: () => void;
  summaryActivities: ActivitySummary[];
  loadEvents: () => Promise<void>;
}

export function useCalendarPage(): UseCalendarPageReturn {
  const timezone = useAthleteTimezone();
  const { mutate } = useSWRConfig();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const now = new Date();

  const [view, setView] = useState<CalendarView>(() => parseViewParam(searchParams.get("view")));
  const [weekStart, setWeekStart] = useState<Date>(getMonday(now));
  const [monthDate, setMonthDate] = useState<Date>(new Date(now.getFullYear(), now.getMonth(), 1));
  const [events, setEvents] = useState<CalendarEventDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEventDTO | undefined>();
  const [generateOpen, setGenerateOpen] = useState(false);

  useEffect(() => {
    const nextUrl = canonicalCalendarSearch(searchParams, pathname);
    if (nextUrl !== null) router.replace(nextUrl, { scroll: false });
    // Only canonicalize on mount. Next.js searchParams is a new reference
    // every render — subscribing to it would add ~30-50ms TBT per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSetView = useCallback((nextView: CalendarView) => {
    setView(nextView);
    router.replace(calendarViewUrl(nextView, pathname), { scroll: false });
  }, [pathname, router, setView]);

  const isGridView = view === "week" || view === "month";

  const rangeFrom = view === "week"
    ? new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 2).toISOString()
    : view === "month"
      ? new Date(monthDate.getFullYear(), monthDate.getMonth(), -1).toISOString()
      : new Date().toISOString();
  const rangeTo = view === "week"
    ? new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 8, 23, 59, 59).toISOString()
    : view === "month"
      ? new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 3, 23, 59, 59).toISOString()
      : new Date().toISOString();

  const activityResult = useActivities(
    rangeFrom.slice(0, 10),
    rangeTo.slice(0, 10),
  );
  const { data: activities, error: activitiesError } = activityResult;

  // Grouped by the athlete's local day, not the payload's UTC date. A 21:00
  // Asia/Shanghai run carries a UTC timestamp dated the previous day, so
  // `slice(0, 10)` put it in the wrong cell of the week grid.
  const activityMap = useMemo(() => {
    const map = new Map<string, ActivitySummary[]>();
    for (const a of activities) {
      const day = activityLocalDay(a.start_time, timezone);
      const bucket = map.get(day);
      if (bucket) bucket.push(a);
      else map.set(day, [a]);
    }
    return map;
  }, [activities, timezone]);

  const loadEvents = useCallback(async () => {
    if (!isGridView) { setLoading(false); return; }
    setError(null);
    try {
      const data = await callOrvalValidated(
        (f) => listEventsApiV1CalendarGet({ from: rangeFrom, to: rangeTo }, {}, f),
        z.array(Generated.CalendarEventOutput),
      );
      const nextEvents = data.map(mapCalendarEvent);
      setEvents(nextEvents);
      setEditingEvent((current) =>
        current
          ? nextEvents.find((event) => event.event_id === current.event_id)
          : undefined,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "训练计划加载失败");
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo, isGridView]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLoading(true); loadEvents(); }, [loadEvents]);

  const navWeek = (delta: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d);
    setSelectedDate(null);
  };

  const navMonth = (delta: number) => {
    setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + delta, 1));
    setSelectedDate(null);
  };

  // "Today" in the athlete's zone: a traveller whose browser is on another
  // zone must still see their own training day highlighted.
  const today = athleteToday(timezone);

  const handleSelectDate = (iso: string) => {
    const existing = events.filter((e) => activityLocalDay(e.start_time, timezone) === iso);
    setEditingEvent(existing[0]);
    setSelectedDate(iso);
  };

  const handleBuilderSave = () => {
    setSelectedDate(null);
    void loadEvents();
  };

  const handleActivitySaved = () => {
    void loadEvents();
    activityResult.reload();
    void invalidateDataCards(mutate);
  };

  const dayActivities = selectedDate ? (activityMap.get(selectedDate) ?? []) : [];
  const firstActivityId = dayActivities[0]?.activity_id;
  const dateClickOutcome = selectedDate
    ? decideDateClickOutcome(selectedDate, today, firstActivityId)
    : null;
  const summaryActivities =
    dateClickOutcome?.kind === "summary" ? dayActivities : [];

  return {
    view,
    handleSetView,
    weekStart,
    monthDate,
    events,
    loading,
    error,
    activitiesError,
    selectedDate,
    setSelectedDate,
    editingEvent,
    generateOpen,
    setGenerateOpen,
    activityMap,
    isGridView,
    navWeek,
    navMonth,
    handleSelectDate,
    handleBuilderSave,
    handleActivitySaved,
    summaryActivities,
    loadEvents,
  };
}

function mapCalendarEvent(raw: Generated.CalendarEventOutputOutput): CalendarEventDTO {
  return {
    event_id: raw.event_id,
    start_time: raw.start_time,
    category: raw.category,
    sport_type: raw.sport_type ?? undefined,
    name: raw.name ?? undefined,
    workout_xml: raw.workout_xml ?? undefined,
    predicted_tss: raw.predicted_tss ?? null,
    status: raw.status ?? undefined,
    done: raw.done ?? undefined,
    training_type: raw.training_type ?? null,
    workout_prescription: raw.workout_prescription
      ? {
          ...raw.workout_prescription,
          phase: raw.workout_prescription.phase ?? undefined,
          segments: raw.workout_prescription.segments.map((segment) => ({
            ...segment,
            repetitions: segment.repetitions ?? undefined,
            recovery_min: segment.recovery_min ?? undefined,
            rpe_min: segment.rpe_min ?? undefined,
            rpe_max: segment.rpe_max ?? undefined,
          })),
        }
      : null,
    athlete_edited: raw.athlete_edited ?? false,
    completed_distance_m: raw.completed_distance_m ?? null,
    completed_duration_s: raw.completed_duration_s ?? null,
    completed_avg_hr: raw.completed_avg_hr ?? null,
    completed_rpe: raw.completed_rpe ?? null,
    actual_logged_at: raw.actual_logged_at ?? null,
  };
}
