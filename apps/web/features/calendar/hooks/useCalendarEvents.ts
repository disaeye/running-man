"use client";

import useSWR, { mutate } from "swr";
import type { CalendarEventDTO } from "@features/calendar/components/types";

interface UseCalendarEventsResult {
  events: CalendarEventDTO[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** SWR-based hook for fetching calendar events from the backend. */
export function useCalendarEvents(from: string, to: string): UseCalendarEventsResult {
  const { data, error, isLoading } = useSWR<CalendarEventDTO[]>(
    ["/calendar", { from, to }],
  );
  const reload = () => mutate(["/calendar", { from, to }]);
  return {
    events: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    reload,
  };
}
