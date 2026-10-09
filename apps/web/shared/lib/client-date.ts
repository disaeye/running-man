"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useAthleteTimezone } from "./training-day";

/**
 * A date label that survives hydration.
 *
 * `new Date().toLocaleDateString(...)` looks harmless in a component, but a
 * client component is also pre-rendered on the server, and the two sides do not
 * share a clock or a timezone. Vercel runs functions in UTC while the athlete
 * reads the page in Asia/Shanghai, so the server emitted "9月13日星期日" and the
 * browser rendered "9月14日星期一" — a text mismatch on every dashboard page,
 * which React reports as hydration error 418 and resolves by discarding the
 * server-rendered subtree.
 *
 * Nothing failed loudly: the page still looked right and the Playwright suite
 * passed, because a hydration mismatch is a console error rather than a crash.
 *
 * `useSyncExternalStore` is the purpose-built API for exactly this. Its
 * `getServerSnapshot` returns "" so the server output and the client's first
 * render agree by construction, and React re-renders with the real value once
 * hydration completes — no effect, and no state update during render.
 *
 * The label formats in the athlete's timezone from the profile rather than the
 * browser's, matching the rule the rest of the app follows: a traveller whose
 * laptop is on another zone must still see their own training day.
 */
export function useClientDateLabel(
  options: Intl.DateTimeFormatOptions,
  locale = "zh-CN",
): string {
  const timezone = useAthleteTimezone();

  // A call-site literal, so its serialisation is a stable dependency. The
  // subscribe function is empty because the clock is not a changing external
  // value here: the label is per-mount, as it was before.
  const optionsKey = JSON.stringify(options);

  const getSnapshot = () => formatNow(locale, timezone, optionsKey);

  return useSyncExternalStore(subscribeNoop, getSnapshot, rendersEmptyOnServer);
}

/**
 * The server (and first client) render value.
 *
 * Exported so a test can assert the mechanism directly: this is the only value
 * both sides can produce, since only one of them knows the real date.
 */
export function rendersEmptyOnServer(): string {
  return "";
}

/**
 * A time-of-day greeting, resolved after hydration.
 *
 * `new Date().getHours()` during render is the same build-time trap as the
 * date label: the value is decided by whichever clock renders first and then
 * compared on hydration. Returning "" on the server keeps them in agreement.
 */
export function useClientGreeting(): string {
  const hour = useSyncExternalStore(
    subscribeNoop,
    () => new Date().getHours(),
    rendersEmptyOnServerNumber,
  );
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

/** The server's answer to "what hour is it" — it does not know. */
function rendersEmptyOnServerNumber(): number {
  return -1;
}

/**
 * Whether the component has hydrated on the client.
 *
 * False during the server render and the first client render, true afterwards.
 * The purpose is to keep a value the server cannot know — today's date, the
 * current week — out of the pre-rendered HTML entirely, so hydration cannot
 * disagree with it.
 *
 * This matters more than it sounds. These routes are statically pre-rendered,
 * so a value computed during render is written into the HTML *at build time*
 * and then served unchanged for as long as that build lives. The home page
 * baked its date and its whole week grid this way: a build made on Sep 13
 * served a grid starting 09-13 with "today" on the 13th, in UTC, to athletes in
 * Asia/Shanghai — and the browser then corrected it during hydration, which
 * React reports as a text mismatch rather than a visible break.
 */
export function useHasMounted(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

/**
 * A trailing day range ending today, resolved after hydration.
 *
 * The activity filters used `useState(() => computeRange(90))`, which is a
 * build-time computation like any other: the pre-rendered HTML carried
 * `<input value="2026-09-14">` taken from the build machine's clock, so a page
 * built in June offered a June-to-June date range.
 *
 * Returns an empty range until hydration. The snapshot is a string because
 * React requires a cached value — an object returned fresh from `getSnapshot`
 * would loop.
 */
export function useClientDayRange(days: number): { from: string; to: string } {
  const today = useSyncExternalStore(
    subscribeNoop,
    isoToday,
    rendersEmptyOnServer,
  );
  return useMemo(
    () => (today ? rangeEndingOn(today, days) : { from: "", to: "" }),
    [today, days],
  );
}

/**
 * Today in the browser's zone, as `YYYY-MM-DD`.
 *
 * `useSyncExternalStore` needs a stable snapshot, so this reads the clock only
 * when React asks for it, not once per render pass.
 */
function isoToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The `days`-day window ending on `to`, matching `computeRange` in
 * `shared/lib/format`, which counts back from today to the same day.
 */
function rangeEndingOn(to: string, days: number): { from: string; to: string } {
  const [year, month, day] = to.split("-").map(Number) as [number, number, number];
  // Calendar arithmetic on the day key, so a DST boundary cannot drop a day.
  const from = new Date(Date.UTC(year, month - 1, day - days));
  return { from: from.toISOString().slice(0, 10), to };
}

/**
 * Format `instant` in `timezone`, falling back to the runtime's zone when the
 * timezone is unusable — an unknown zone must not blank the header.
 *
 * Pure and exported so the timezone divergence is testable without rendering.
 */
export function formatDateLabelFor(
  instant: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
  locale = "zh-CN",
): string {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: timezone }).format(
      instant,
    );
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(instant);
  }
}

/**
 * Nothing to subscribe to: neither the mount flag nor a per-mount date label
 * observes an external store, so there is no subscription to maintain.
 */
function subscribeNoop(): () => void {
  return () => {};
}

function formatNow(
  locale: string,
  timezone: string,
  optionsKey: string,
): string {
  const options = JSON.parse(optionsKey) as Intl.DateTimeFormatOptions;
  return formatDateLabelFor(new Date(), timezone, options, locale);
}
