import { toISODate } from "@shared/lib/format";

export type CalendarViewMode = "week" | "month" | "list";

/** The date window the plan-quality panel audits, derived from the active view. */
export function qualityRange(
  view: CalendarViewMode,
  weekStart: Date,
  monthDate: Date,
): { from: string; to: string } | undefined {
  if (view === "week") {
    const from = new Date(weekStart);
    from.setDate(from.getDate() - 1);
    const to = new Date(weekStart);
    to.setDate(to.getDate() + 7);
    return { from: toISODate(from), to: toISODate(to) };
  }
  if (view === "month") {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    return {
      from: toISODate(new Date(year, month, 0)),
      to: toISODate(new Date(year, month + 1, 1)),
    };
  }
  return undefined;
}
