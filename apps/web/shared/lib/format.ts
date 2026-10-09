export function formatDistance(meters: number | null): string {
  if (meters == null) return "--";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
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
  const secPerKm = 1000 / speedMs;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}'${sec.toString().padStart(2, "0")}"`;
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

/** Format heart rate (e.g. 150 → "150 bpm") */
export function formatHeartRate(bpm: number | null): string {
  if (bpm == null) return "--";
  return `${Math.round(bpm)} bpm`;
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
