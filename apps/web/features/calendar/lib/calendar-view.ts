export type CalendarView = "week" | "month" | "list";

export const CALENDAR_VIEWS: readonly CalendarView[] = ["week", "month", "list"];

/** Resolve `?view=` to a view; anything unknown falls back to the week grid. */
export function resolveCalendarView(raw: string | null): CalendarView {
  return CALENDAR_VIEWS.includes(raw as CalendarView) ? (raw as CalendarView) : "week";
}
