/**
 * 月历的七列排布。
 *
 * 一周从周一开始（表头是 一 到 日），所以首格到 1 号之间的空位用上一个月的日子填。
 * 这些格子只做视觉填充：`inMonth: false`，不承接点击。
 */
export interface MonthGridDay {
  readonly date: Date;
  readonly inMonth: boolean;
}

export function buildMonthWeeks(year: number, month: number): MonthGridDay[][] {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  const weeks: MonthGridDay[][] = [];
  for (let index = 0; index < cells; index += 1) {
    if (index % 7 === 0) weeks.push([]);
    const date = new Date(year, month, 1 - firstDow + index);
    weeks[weeks.length - 1]!.push({ date, inMonth: date.getMonth() === month });
  }
  return weeks;
}
