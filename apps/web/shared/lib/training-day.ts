/**
 * Training-day clock — the athlete's local calendar day.
 *
 * Mirrors `apps/api/src/domain/time/__init__.py`, which is the backend's single
 * source of truth for this. Running training is organized around the athlete's
 * local day (sleep one night, plan one day, readiness one day), so bucketing by
 * UTC is a bug: a 21:00 Asia/Shanghai run lands on the previous UTC day. The
 * backend states this explicitly and routes every day-keyed computation through
 * its equivalent of this module.
 *
 * The frontend had three competing conventions instead:
 *
 *   `iso.slice(0, 10)`              — keeps the UTC date from the payload
 *   `new Date(iso).toISOString()…`  — converts to UTC then truncates
 *   `toISODate(new Date())`         — uses the *browser's* local zone
 *
 * All three disagree for part of every day. A run at 23:48 UTC is the 12th for
 * an athlete in Asia/Shanghai and the 11th everywhere in this file today, so
 * the same activity could appear on different days in different views.
 *
 * Two rules follow, and both matter:
 *
 * - Anything comparing an activity to a day key uses `activityLocalDay` with the
 *   athlete's IANA timezone, not the payload's UTC date.
 * - Anything building a "today" range uses the athlete's timezone, not the
 *   browser's: a traveller whose laptop is on a different zone than their
 *   profile must still see their own training day.
 */

import { useProfile } from "@features/settings/hooks/useProfile";

/** Fallback when the profile has no usable timezone. Matches the API default. */
export const DEFAULT_TIMEZONE = "UTC";

/**
 * Format a Date as `YYYY-MM-DD` in a specific IANA timezone.
 *
 * Uses `Intl` with `en-CA`, which formats as `YYYY-MM-DD`, rather than
 * subtracting an offset by hand: the offset changes with daylight saving, and a
 * fixed number of hours is wrong twice a year in most zones.
 */
export function isoDayInZone(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || DEFAULT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    // Unknown zone: behave like the API, which falls back to UTC rather than
    // failing the computation.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
}

/**
 * The athlete's local training day for an instant.
 *
 * Accepts the ISO timestamp the API returns (any offset) and returns
 * `YYYY-MM-DD` in `timezone`. Prefer this over `iso.slice(0, 10)`, which keeps
 * the UTC date.
 */
export function activityLocalDay(
  instant: string | Date,
  timezone: string = DEFAULT_TIMEZONE,
): string {
  const parsed = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(parsed.getTime())) return "";
  return isoDayInZone(parsed, timezone);
}

/**
 * Today's `YYYY-MM-DD` for the athlete, and the inclusive range ending today.
 *
 * `days` counts back from today inclusive, so `athleteRange(7, tz)` covers today
 * plus the six preceding days.
 */
export function athleteToday(
  timezone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): string {
  return isoDayInZone(now, timezone);
}

export function athleteRange(
  days: number,
  timezone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): { from: string; to: string } {
  const to = athleteToday(timezone, now);
  if (days <= 1) return { from: to, to };
  // `Date.UTC` arithmetic on the day key avoids DST jumps that would otherwise
  // drop or duplicate a day: the key is already the athlete's local date, and
  // shifting it by whole days is a pure calendar operation.
  const [year, month, day] = to.split("-").map(Number) as [number, number, number];
  const from = new Date(Date.UTC(year, month - 1, day - (days - 1)));
  return { from: from.toISOString().slice(0, 10), to };
}

/**
 * Group a timestamp by the athlete's local day, for bucketing lists and charts.
 *
 * Returns `"unknown"` for an unparseable timestamp so a bad row is visibly
 * ungrouped rather than silently landing on today.
 */
export function groupKeyByLocalDay(
  instant: string | Date,
  timezone: string = DEFAULT_TIMEZONE,
): string {
  return activityLocalDay(instant, timezone) || "unknown";
}

/**
 * The athlete's IANA timezone, for use at day-keying call sites.
 *
 * Kept separate from the pure helpers so components can call it directly
 * without threading a prop through every layer. SWR dedupes the underlying
 * request, so using it in several components costs one fetch.
 *
 * Returns UTC while the profile loads. That is the same fallback the API uses,
 * so an early render is consistent with what the backend would compute — not a
 * third convention.
 */
export function useAthleteTimezone(): string {
  const { profile } = useProfile();
  return profile?.timezone || DEFAULT_TIMEZONE;
}
