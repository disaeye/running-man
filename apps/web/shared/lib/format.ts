import { HEART_RATE_UNIT } from "@shared/config/terms";

/**
 * 时钟式显示：一小时以内 `40:12`，一小时以上 `1:31:20`。
 *
 * 秒数先取整并归零（负数变 `0:00`），有小时才带小时位。
 */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${secs}`;
  return `${minutes}:${secs}`;
}

export function formatDistance(meters: number | null): string {
  if (meters == null) return "--";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "--";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/**
 * Render a date for display.
 *
 * A date-only input (`2026-09-11`) is returned unchanged. A timestamp is *not*
 * truncated in UTC: `new Date(iso).toISOString().slice(0, 10)` converts to UTC
 * first, so a 23:48Z activity displays as the 11th even for an athlete whose
 * training day is the 12th. Formatting happens in the browser's zone, which is
 * the right default for a label — and is deliberately display-only. Anything
 * that *compares* against a day key must use `activityLocalDay` from
 * `@shared/lib/training-day`, which uses the athlete's zone.
 */
export function formatDate(iso: string): string {
  // Date-only: no conversion, so no opportunity to shift the day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Format Date to YYYY-MM-DD */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Compute a date range counting back N days from today */
export function computeRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days);
  return { from: toISODate(from), to: toISODate(to) };
}

/** Get this week's range: Monday through today */
export function getWeekRange(): { from: string; to: string } {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  return { from: toISODate(monday), to: toISODate(now) };
}

/** Convert m/s to min'sec" per-km pace (e.g. 3.2 m/s → "5'12\"") */
export function formatPace(speedMs: number | null): string {
  if (speedMs == null || speedMs <= 0) return "--";
  return formatPaceFromSeconds(1000 / speedMs);
}

/** Seconds per kilometre to min'sec" (e.g. 270 → "4'30\""). */
export function formatPaceFromSeconds(secPerKm: number | null): string {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return "--";
  const total = Math.round(secPerKm);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}'${sec.toString().padStart(2, "0")}"`;
}

/** Largest-remainder integer percentages summing to 100 (all 0 if total <= 0). */
export function largestRemainderPercent(values: readonly number[]): number[] {
  const safe = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = safe.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return safe.map(() => 0);
  const exact = safe.map((v) => (v / total) * 100);
  const floors = exact.map((v) => Math.floor(v));
  const remainder = 100 - floors.reduce((sum, v) => sum + v, 0);
  const order = exact
    .map((v, idx) => ({ idx, frac: v - floors[idx]! }))
    .sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < remainder && i < order.length; i += 1) {
    floors[order[i]!.idx] = (floors[order[i]!.idx] ?? 0) + 1;
  }
  return floors;
}

/** Format calories (e.g. 450 → "450 kcal") */
export function formatCalories(kcal: number | null): string {
  if (kcal == null) return "--";
  return `${Math.round(kcal)} kcal`;
}

/** Format elevation gain in meters (e.g. 120 → "120 m") */
export function formatElevation(m: number | null): string {
  if (m == null) return "--";
  return `${Math.round(m)} m`;
}

/** Format heart rate (e.g. 150 → "150 bpm"); 单位来自 HEART_RATE_UNIT。 */
export function formatHeartRate(bpm: number | null): string {
  if (bpm == null) return "--";
  return `${Math.round(bpm)} ${HEART_RATE_UNIT}`;
}

/** Format power output (e.g. 250 → "250 W") */
export function formatPower(watts: number | null): string {
  if (watts == null) return "--";
  return `${Math.round(watts)} W`;
}

/** Filter items by date range (inclusive); extracts YYYY-MM-DD from ISO timestamps */
export function filterByDate<T>(
  items: T[],
  getDate: (item: T) => string,
  from: string,
  to: string,
): T[] {
  return items.filter((t) => {
    const d = getDate(t).slice(0, 10);
    return d >= from && d <= to;
  });
}

/** Format an ISO timestamp as relative time (e.g. "3 分钟前", "2 小时前") */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} 天前`;
  return formatDate(iso);
}
