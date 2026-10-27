/**
 * 比赛成绩的时间输入。
 *
 * 跑者写 `1:31:20`（时:分:秒），也写 `91:20`（分:秒）。存下来的永远是秒，
 * 所以边界上只有这两个函数：解析与显示。两种写法都按「最后一段是秒、往左
 * 是分、再往左是小时」读，分与秒各自上界 59：`91:20` 是 91 分钟 20 秒，
 * 不是 91 小时 20 分。格式非法返回 null，由调用方决定怎么提示。
 */

import { formatClock } from "@shared/lib/format";

const HOURS_MINUTES_SECONDS = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/;
const MINUTES_SECONDS = /^(\d{1,3}):([0-5]\d)$/;

export function parseRaceTime(input: string): number | null {
  const text = input.trim();
  if (text === "") return null;
  const withHours = HOURS_MINUTES_SECONDS.exec(text);
  if (withHours) {
    const [, hours, minutes, seconds] = withHours;
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  }
  const withoutHours = MINUTES_SECONDS.exec(text);
  if (withoutHours) {
    const [, minutes, seconds] = withoutHours;
    return Number(minutes) * 60 + Number(seconds);
  }
  return null;
}

/** 显示只有一种写法：一小时以内 `40:12`，一小时以上 `1:31:20`。 */
export function formatRaceTime(seconds: number): string {
  return formatClock(seconds);
}
