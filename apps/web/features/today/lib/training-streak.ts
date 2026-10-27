export interface WeekSessions {
  /** 周键，ISO 日期字符串（周一的 YYYY-MM-DD）；按字典序即按时间序。 */
  week: string;
  actual_sessions: number;
}

/**
 * 从最近一周往回数，连续有训练记录的周数。
 *
 * 输入不保证有序——接口按查询窗口返回，调用方也可能先合并过几段数据，
 * 所以先按 `week` 升序排一次再数。
 *
 * **当前这周还没结束也计入**：只要本周已经有至少一次训练，就算连续中的一周。
 * 否则周一早上打开首页，上周开始攒起来的连续记录会先掉回 0 再重新涨，
 * 那个 0 描述的是「本周还没过完」，不是「中断了」。遇到 `actual_sessions` 为 0
 * 的周停下，更早的周不再看。空数组返回 0。
 */
export function trainingStreak(weeks: ReadonlyArray<WeekSessions>): number {
  if (weeks.length === 0) return 0;

  const ordered = [...weeks].sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0));

  let streak = 0;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const trained = ordered[index]?.actual_sessions ?? 0;
    if (trained <= 0) break;
    streak += 1;
  }
  return streak;
}
