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

import { useEffect, useSyncExternalStore } from "react";
import { useProfile } from "@features/settings/hooks/useProfile";

/** Fallback when the profile has no usable timezone. Matches the API default. */
export const DEFAULT_TIMEZONE = "UTC";

const TIMEZONE_CACHE_KEY = "running-man:athlete-timezone";

/** 跨页面与跨会话复用的时区，避免每次打开页面都等 profile 往返。 */
let cachedTimezone: string | null = null;

export function readCachedTimezone(): string {
  if (cachedTimezone !== null) return cachedTimezone;
  if (typeof window === "undefined") return DEFAULT_TIMEZONE;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(TIMEZONE_CACHE_KEY);
  } catch {
    stored = null;
  }
  // 首次访问没有缓存时，浏览器时区就是注册时写入 profile 的值。
  const guessed = stored || Intl.DateTimeFormat().resolvedOptions().timeZone;
  cachedTimezone = guessed || DEFAULT_TIMEZONE;
  return cachedTimezone;
}

export function rememberTimezone(timezone: string): void {
  if (!timezone || timezone === cachedTimezone) return;
  cachedTimezone = timezone;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TIMEZONE_CACHE_KEY, timezone);
  } catch {
    // 隐私模式下 localStorage 不可写，进程内的缓存仍然生效。
  }
}

function subscribeNoop(): () => void {
  return () => {};
}

function snapshotMounted(): boolean {
  return true;
}

function snapshotHydrating(): boolean {
  return false;
}

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

/**
 * This week's range on the athlete's clock: Monday through today.
 *
 * `getWeekRange` in `@shared/lib/format` derives the weekday from the host's
 * calendar. That is a different week whenever the athlete and the host disagree
 * about which day it is — and Monday-anchoring makes the two answers differ by
 * a whole week at the boundary, not just by a day. A week of planned sessions
 * is exactly the range a one-week error corrupts most visibly.
 *
 * The day arithmetic runs on the already-resolved day key, so it cannot drift
 * across a DST transition the way subtracting milliseconds would.
 */
export function athleteWeekRange(
  timezone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): { from: string; to: string } {
  const to = athleteToday(timezone, now);
  const [year, month, day] = to.split("-").map(Number) as [number, number, number];
  // Date.UTC(..., dow) with `dow` from getUTCDay: the resolved key is already
  // the athlete's date, so its UTC weekday is the athlete's weekday.
  const anchor = Date.UTC(year, month - 1, day);
  const weekday = new Date(anchor).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const from = new Date(anchor + mondayOffset * 86_400_000);
  return { from: from.toISOString().slice(0, 10), to };
}

export function athleteRange(
  days: number,
  timezone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): { from: string; to: string } {
  return rangeEndingOn(athleteToday(timezone, now), days);
}

/**
 * A `days`-wide window whose last day is `to`.
 *
 * Operates on an already-resolved day key rather than on an instant, so the
 * result does not depend on where the code is running. Callers that have a day
 * key in hand — a preset button rebuilding its window, a range the user picked —
 * need this rather than `athleteRange`, which would re-derive today and discard
 * the anchor they already have.
 *
 * `days` counts back from `to` inclusive, so `rangeEndingOn(key, 1)` is that
 * single day.
 */
export function rangeEndingOn(
  to: string,
  days: number,
): { from: string; to: string } {
  if (days <= 1) return { from: to, to };
  // `Date.UTC` arithmetic on the day key avoids DST jumps that would otherwise
  // drop or duplicate a day: the key is already the athlete's local date, and
  // shifting it by whole days is a pure calendar operation.
  const [year, month, day] = to.split("-").map(Number) as [number, number, number];
  const from = new Date(Date.UTC(year, month - 1, day - (days - 1)));
  return { from: from.toISOString().slice(0, 10), to };
}

/**
 * Shift a day key by whole days.
 *
 * Calendar arithmetic on the key itself, so a DST transition cannot add or
 * drop a day the way adding 86400000 milliseconds to an instant can.
 */
export function dayKeyOffset(key: string, deltaDays: number): string {
  const [year, month, day] = key.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + deltaDays)).toISOString().slice(0, 10);
}

/** Weekday of a day key, Monday = 0 … Sunday = 6. */
export function weekdayIndex(key: string): number {
  const [year, month, day] = key.split("-").map(Number) as [number, number, number];
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
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
 * 运动员时区，附带是否可以开始发数据请求。
 *
 * 服务端渲染与水合首帧统一用 UTC、`resolved = false`，这样服务端 HTML 和
 * 浏览器首帧不会因时区不同而报错。水合结束后立即用缓存时区（或浏览器时区）
 * 置 `resolved = true`，依赖时区的 SWR key 在第一波就成立，业务请求与
 * `/athletes/me` 并发发出，不再等 profile 回来才能开始。
 *
 * profile 返回后写入缓存并成为权威值；只有它和缓存不一致时才会换 key 重发。
 */
export function useAthleteTimezoneState(): { timezone: string; resolved: boolean } {
  const { profile } = useProfile();
  const mounted = useSyncExternalStore(
    subscribeNoop,
    snapshotMounted,
    snapshotHydrating,
  );

  useEffect(() => {
    if (profile?.timezone) rememberTimezone(profile.timezone);
  }, [profile?.timezone]);

  return {
    timezone: profile?.timezone || (mounted ? readCachedTimezone() : DEFAULT_TIMEZONE),
    resolved: mounted,
  };
}

export function useAthleteTimezone(): string {
  return useAthleteTimezoneState().timezone;
}
