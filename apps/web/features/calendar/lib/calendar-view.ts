export type CalendarView = "week" | "month";

export const CALENDAR_VIEWS: readonly CalendarView[] = ["week", "month"];

export const CALENDAR_VIEW_LABELS: Readonly<Record<CalendarView, string>> = {
  week: "周历",
  month: "月历",
};

/** Resolve `?view=` to a view; anything unknown falls back to the week grid. */
export function resolveCalendarView(raw: string | null): CalendarView {
  return CALENDAR_VIEWS.includes(raw as CalendarView) ? (raw as CalendarView) : "week";
}
