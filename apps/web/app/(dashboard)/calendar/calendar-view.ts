/**
 * Calendar view URL-state helpers.
 *
 * `?view=week|month|list` selects the calendar mode. The legacy
 * `strength` peer tab was folded into the 日志 view in task 8
 * (strength content lives in `CalendarStrengthView`, rendered inside
 * the log tab); `resolveCalendarView` maps `?view=strength` to `list`.
 *
 * The primary tab bar exposes only two peer tabs — 计划 and 日志.
 * `primaryTabFromView` derives the active primary tab from the URL
 * view id: week/month → "plan", list → "log".
 *
 * Extracted from `page.tsx` so the parsing logic is unit-testable and
 * the page stays within the 250 pure-LOC gate.
 */

import {
  resolveCalendarView,
  type CalendarViewId as CanonicalCalendarViewId,
} from "@shared/config/canonical-routes";

export type CalendarView = CanonicalCalendarViewId;

export type CalendarPrimaryTabId = "plan" | "log";

export const CALENDAR_VIEW_TABS: ReadonlyArray<{
  readonly id: CalendarPrimaryTabId;
  readonly label: string;
}> = [
  { id: "plan", label: "计划" },
  { id: "log", label: "日志" },
] as const;

/** Parse the `?view=` search param; falls back to "week" for unknown/missing values. */
export const parseViewParam = resolveCalendarView;

/** Derive the active primary tab ("plan" | "log") from a resolved view id. */
export function primaryTabFromView(view: CalendarView): CalendarPrimaryTabId {
  return view === "list" ? "log" : "plan";
}

/**
 * Outcome of a calendar date click.
 *
 * - `summary`: a past date has a completed activity; show summary sheet
 *   and link to `/activities/[id]`.
 * - `builder`: future date, empty date, or past date without a completed
 *   activity; show the workout builder.
 */
export type DateClickOutcome =
  | { kind: "summary"; activityId: string }
  | { kind: "builder" };

/**
 * Decide which sheet to open for a clicked calendar date.
 *
 * `selectedDate` and `today` are ISO date strings (`YYYY-MM-DD`). A date is
 * considered past when it is strictly less than `today`. Past dates with
 * completed activities show the summary path; everything else opens the
 * workout builder so the user can plan or revise a workout.
 */
export function decideDateClickOutcome(
  selectedDate: string,
  today: string,
  completedActivityId: string | null | undefined,
): DateClickOutcome {
  if (selectedDate < today && completedActivityId) {
    return { kind: "summary", activityId: completedActivityId };
  }
  return { kind: "builder" };
}

/**
 * Return the Monday 00:00 of the week containing `d`. Used to anchor the
 * week view's initial `weekStart` state. Pure (no I/O).
 */
export function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Compute the next ISO date when navigating a calendar view by `delta`
 * weeks or months. The base date is the existing `weekStart` / `monthDate`
 * anchor from page state. Pure (no I/O) so the page does not need to
 * own the math.
 */
export function nextWeekStart(current: Date, delta: number): Date {
  const d = new Date(current);
  d.setDate(d.getDate() + delta * 7);
  return d;
}

export function nextMonthDate(current: Date, delta: number): Date {
  return new Date(current.getFullYear(), current.getMonth() + delta, 1);
}

/**
 * Determine whether navigation (prev/next week/month) should reset the
 * currently selected date. Both week and month navigation currently
 * always reset, but the helper makes the invariant explicit so the page
 * does not silently change the policy later.
 */
export function clearSelectionOnNavigate(_view: CalendarView): true {
  return true;
}

/**
 * Return the previously-selected date when navigation does not reset
 * it (reserved for future "always preserve selection" UX). For now this
 * is always null since navigation clears selection; the helper exists
 * so the page returns `null` consistently without spreading the logic.
 */
export function preservedSelection(view: CalendarView): string | null {
  void view;
  return null;
}
