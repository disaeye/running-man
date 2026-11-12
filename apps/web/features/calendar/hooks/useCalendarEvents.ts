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
  // 空范围代表「日期还没定」，不是请求全部：后端对缺参回答 422。
  const hasRange = Boolean(from && to);
  const { data, error, isLoading } = useSWR<CalendarEventDTO[]>(
    hasRange ? ["/calendar", { from, to }] : null,
  );
  const reload = () => {
    if (hasRange) void mutate(["/calendar", { from, to }]);
  };
  return {
    events: data ?? [],
    loading: hasRange && isLoading,
    error: error?.message ?? null,
    reload,
  };
}
