import { formatDuration, formatPaceFromSeconds } from "@shared/lib/format";
import { getSportConfig, type SportFamily } from "@shared/config/sport-config";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";

export interface DeltaBadgeItem {
  readonly key?: "distance" | "duration" | "pace";
  readonly label: string;
  readonly tone: "success" | "warn" | "neutral";
}

export function sumRecorded(
  activities: readonly ActivitySummary[],
  read: (activity: ActivitySummary) => number | null,
): number | null {
  let total = 0;
  let count = 0;
  for (const activity of activities) {
    const value = read(activity);
    if (value == null) continue;
    total += value;
    count += 1;
  }
  return count === 0 ? null : total;
}

export function weightedRecorded(
  activities: readonly ActivitySummary[],
  read: (activity: ActivitySummary) => number | null,
): number | null {
  let weighted = 0;
  let weight = 0;
  for (const activity of activities) {
    const value = read(activity);
    const seconds = activity.duration_s;
    if (value == null || seconds == null || seconds <= 0) continue;
    weighted += value * seconds;
    weight += seconds;
  }
  return weight === 0 ? null : weighted / weight;
}

export function plannedFamily(event: CalendarEventDTO): SportFamily | null {
  if (!event.sport_type) return null;
  const family = getSportConfig(event.sport_type).family;
  return family === "unknown" ? null : family;
}

export function othersLine(
  others: readonly ActivitySummary[],
  comparedCount: number,
  plannedLabel: string | null,
): string | null {
  if (others.length === 0) return null;

  const labels = new Map<string, number>();
  for (const activity of others) {
    const label = getSportConfig(activity.sport).label;
    labels.set(label, (labels.get(label) ?? 0) + 1);
  }
  const counts = [...labels]
    .map(([label, count]) => `${count} 次${label}`)
    .join("、");
  const totalS = sumRecorded(others, (activity) => activity.duration_s);
  const duration = totalS == null ? null : formatDuration(totalS);
  const amount =
    duration == null ? "" : labels.size > 1 ? `，合计 ${duration}` : `，${duration}`;

  return comparedCount === 0
    ? `当天没有${plannedLabel ?? "带距离的训练"}，只有 ${counts}${amount}`
    : `当天另有 ${counts}${amount}`;
}

function formatPaceDelta(seconds: number): string {
  const abs = Math.round(Math.abs(seconds));
  const min = Math.floor(abs / 60);
  const sec = abs % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export function buildPlanActualDeltas(params: {
  readonly plannedDistanceM: number | null;
  readonly actualDistanceM: number | null;
  readonly plannedDurationMin: number | null;
  readonly actualDurationS: number | null;
  readonly paceMinS: number | null;
  readonly paceMaxS: number | null;
}): DeltaBadgeItem[] {
  const badges: DeltaBadgeItem[] = [];
  const {
    plannedDistanceM,
    actualDistanceM,
    plannedDurationMin,
    actualDurationS,
    paceMinS,
    paceMaxS,
  } = params;

  if (plannedDistanceM != null && plannedDistanceM > 0 && actualDistanceM != null) {
    const diffKm = (actualDistanceM - plannedDistanceM) / 1000;
    if (Math.abs(diffKm) < 0.15) {
      badges.push({ key: "distance", label: "距离达标 ✓", tone: "success" });
    } else {
      const sign = diffKm > 0 ? "+" : "";
      badges.push({
        key: "distance",
        label: `距离 ${sign}${diffKm.toFixed(1)} km`,
        tone: diffKm >= -0.3 ? "neutral" : "warn",
      });
    }
  }

  if (plannedDurationMin != null && plannedDurationMin > 0 && actualDurationS != null) {
    const diffMin = Math.round(actualDurationS / 60 - plannedDurationMin);
    if (Math.abs(diffMin) <= 2) {
      badges.push({ key: "duration", label: "时长达标 ✓", tone: "success" });
    } else {
      const sign = diffMin > 0 ? "+" : "";
      badges.push({
        key: "duration",
        label: `时长 ${sign}${diffMin} min`,
        tone: diffMin >= -5 ? "neutral" : "warn",
      });
    }
  }

  if (
    paceMinS != null &&
    paceMaxS != null &&
    actualDistanceM != null &&
    actualDistanceM > 0 &&
    actualDurationS != null &&
    actualDurationS > 0
  ) {
    const actualPace = actualDurationS / (actualDistanceM / 1000);
    const low = Math.min(paceMinS, paceMaxS);
    const high = Math.max(paceMinS, paceMaxS);
    if (actualPace < low - 3) {
      badges.push({
        key: "pace",
        label: `配速快于目标 ${formatPaceDelta(low - actualPace)}/km (${formatPaceFromSeconds(Math.round(actualPace))})`,
        tone: "warn",
      });
    } else if (actualPace > high + 3) {
      badges.push({
        key: "pace",
        label: `配速慢于目标 ${formatPaceDelta(actualPace - high)}/km`,
        tone: "warn",
      });
    } else {
      badges.push({ key: "pace", label: "配速在目标区间 ✓", tone: "success" });
    }
  }

  return badges;
}
