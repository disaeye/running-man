import type { Goal } from "@shared/types/goals";
import { formatClock } from "@shared/lib/format";

/**
 * 目标值的读取形态：值已经排好版，单位（如果有）另外给出。
 * 没有值时是 null——调用方拿 null 去占位，而不是显示一个空的数字。
 */
export interface GoalReading {
  readonly value: string;
  readonly unit?: string;
}

/** 时间类目标的单位倍率：秒 → 分 → 小时。 */
const TIME_FACTORS: Readonly<Record<string, number>> = {
  秒: 1,
  s: 1,
  sec: 1,
  分: 60,
  min: 60,
  小时: 3600,
  h: 3600,
};

/** 整数就写整数；不是整数就留一位小数。 */
function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** 单位不认识（或为空）时按秒算：比赛目标默认就是秒。 */
function timeFactor(unit: string | null): number {
  if (!unit) return 1;
  return TIME_FACTORS[unit.trim().toLowerCase()] ?? 1;
}

/**
 * 把一个目标值变成该读的形态。
 *
 * 比赛与时间是时钟形态（`1:30:40`），距离是公里或米，体重带自己的单位，
 * 坚持是天。`value` 为 null 时返回 null，交给调用方画占位符。
 */
export function goalReading(
  goal: Goal,
  value: number | null,
): GoalReading | null {
  if (value == null) return null;

  switch (goal.type) {
    case "event":
    case "time": {
      const seconds = value * timeFactor(goal.unit);
      return { value: formatClock(seconds) };
    }
    case "distance": {
      if (goal.unit?.trim().toLowerCase() === "m") {
        return { value: formatNumber(value), unit: "米" };
      }
      return { value: formatNumber(value), unit: "公里" };
    }
    case "weight": {
      const unit = goal.unit?.trim() || "kg";
      return { value: formatNumber(value), unit };
    }
    case "consistency":
      return { value: formatNumber(value), unit: "天" };
  }
}
