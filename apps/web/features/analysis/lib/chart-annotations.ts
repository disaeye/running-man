import type { ChartAnnotation } from "@shared/ui/LovableChart";
import type { ActivitySummary } from "@shared/types/activity";

const MAX_ANNOTATIONS = 3;
const BREAKTHROUGH_TSS_THRESHOLD = 90;

function shortName(activity: ActivitySummary): string {
  const raw = activity.name?.trim();
  if (!raw) return "重点课";
  return raw.length > 14 ? `${raw.slice(0, 14)}…` : raw;
}

/**
 * 为 PMC 负荷趋势图提取最多 3 个事件锚点：优先标出比赛日，其次补齐高负荷突破训练日。
 */
export function buildPmcAnnotations(
  days: readonly string[],
  activities: readonly ActivitySummary[],
): ChartAnnotation[] {
  const indexByDay = new Map<string, number>();
  days.forEach((day, idx) => {
    const key = day.slice(0, 10);
    if (!indexByDay.has(key)) indexByDay.set(key, idx);
  });

  const used = new Set<number>();
  const out: ChartAnnotation[] = [];

  for (const activity of activities) {
    if (!activity.is_race) continue;
    const idx = indexByDay.get(activity.start_time.slice(0, 10));
    if (idx == null || used.has(idx)) continue;
    used.add(idx);
    out.push({
      index: idx,
      label: "比赛",
      detail: shortName(activity),
      href: `/activities/${activity.activity_id}`,
      tone: "accent",
    });
    if (out.length >= MAX_ANNOTATIONS) break;
  }

  if (out.length < MAX_ANNOTATIONS) {
    const heavyWorkouts = activities
      .filter((activity) => activity.tss != null && activity.tss >= BREAKTHROUGH_TSS_THRESHOLD)
      .sort((a, b) => (b.tss ?? 0) - (a.tss ?? 0));
    for (const activity of heavyWorkouts) {
      const idx = indexByDay.get(activity.start_time.slice(0, 10));
      if (idx == null || used.has(idx)) continue;
      used.add(idx);
      out.push({
        index: idx,
        label: "突破课",
        detail: `TSS ${Math.round(activity.tss!)}`,
        href: `/activities/${activity.activity_id}`,
        tone: "warn",
      });
      if (out.length >= MAX_ANNOTATIONS) break;
    }
  }

  return out.sort((a, b) => a.index - b.index);
}

/**
 * 为效率系数 EF 趋势图提取比赛与周期最佳效率锚点（最多 3 个）。
 */
export function buildEfAnnotations(
  points: readonly {
    day: string;
    activityId: string;
    name: string;
    isRace: boolean;
    value: number;
  }[],
): ChartAnnotation[] {
  const used = new Set<number>();
  const out: ChartAnnotation[] = [];

  points.forEach((point, idx) => {
    if (!point.isRace || out.length >= MAX_ANNOTATIONS || used.has(idx)) return;
    used.add(idx);
    out.push({
      index: idx,
      label: "比赛",
      detail: point.name.length > 14 ? `${point.name.slice(0, 14)}…` : point.name,
      href: `/activities/${point.activityId}`,
      tone: "accent",
    });
  });

  if (out.length < MAX_ANNOTATIONS && points.length >= 3) {
    let bestIdx = -1;
    let bestVal = -Infinity;
    points.forEach((point, idx) => {
      if (point.value > bestVal) {
        bestVal = point.value;
        bestIdx = idx;
      }
    });
    if (bestIdx >= 0 && !used.has(bestIdx)) {
      const best = points[bestIdx]!;
      used.add(bestIdx);
      out.push({
        index: bestIdx,
        label: "周期最佳 EF",
        detail: best.value.toFixed(2),
        href: `/activities/${best.activityId}`,
        tone: "info",
      });
    }
  }

  return out.sort((a, b) => a.index - b.index);
}
