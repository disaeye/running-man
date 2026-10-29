import type { RaceResult } from "@features/settings/hooks/useRaceResults";

/** 按运动距离优先选出比赛成绩摘要。 */
export function bestSummary(results: readonly RaceResult[]): string | null {
  if (results.length === 0) return null;
  const preferred = results.find((row) => row.distance_category === "marathon");
  const best = preferred ?? results[0];
  if (!best) return null;
  const label =
    best.distance_category === "marathon"
      ? "全马"
      : best.distance_category === "half"
        ? "半马"
        : best.distance_category;
  const hours = Math.floor(best.time_s / 3600);
  const minutes = Math.floor((best.time_s % 3600) / 60);
  const seconds = Math.round(best.time_s % 60);
  const time =
    hours > 0
      ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      : `${minutes}:${seconds.toString().padStart(2, "0")}`;
  return `${label} ${time}`;
}
