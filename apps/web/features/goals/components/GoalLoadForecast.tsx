"use client";

import { useMemo } from "react";
import { PageCard, Tag } from "@shared/ui/Lovable";
import { LovableChart, LovableLegend } from "@shared/ui/LovableChart";
import { usePmcData } from "@features/pmc/hooks/usePmcData";
import { useCalendarEvents } from "@features/calendar/hooks/useCalendarEvents";
import { activityLocalDay } from "@shared/lib/training-day";

function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function GoalLoadForecast({ today, targetDate, timezone }: { today: string; targetDate: string | null; timezone: string }) {
  const from = shiftDay(today, -42);
  const to = targetDate && targetDate > today ? targetDate : shiftDay(today, 28);
  const pmc = usePmcData(from, today);
  const events = useCalendarEvents(shiftDay(today, 1), to);
  const future = useMemo(() => {
    const latest = pmc.data.at(-1);
    if (!latest) return [];
    let ctl = latest.ctl;
    let atl = latest.atl;
    const loads = new Map<string, number>();
    for (const event of events.events) {
      if (event.status === "deleted" || event.done || event.predicted_tss == null) continue;
      const day = activityLocalDay(event.start_time, timezone);
      loads.set(day, (loads.get(day) ?? 0) + event.predicted_tss);
    }
    const result: number[] = [];
    let day = today;
    while (day <= to && result.length < 366) {
      day = shiftDay(day, 1);
      const tss = loads.get(day) ?? 0;
      ctl += (tss - ctl) / 42;
      atl += (tss - atl) / 7;
      result.push(ctl);
    }
    return result;
  }, [events.events, pmc.data, timezone, today, to]);
  const forecastLabels = useMemo(() => {
    const history = pmc.data.map((point) => point.day);
    const days = [...history];
    let day = today;
    while (day <= to && days.length < history.length + 366) {
      day = shiftDay(day, 1);
      days.push(day);
    }
    return days.map((value) => value.slice(5));
  }, [pmc.data, today, to]);
  if (!pmc.data.length) return <PageCard title="预计负荷走势"><p className="text-sm text-muted-foreground">尚无负荷记录，无法推演。</p></PageCard>;
  const plannedDays = new Set<string>();
  for (const event of events.events) {
    if (event.status === "deleted" || event.done || event.predicted_tss == null) continue;
    plannedDays.add(activityLocalDay(event.start_time, timezone));
  }
  const hardDays = [...plannedDays].filter((day) => (events.events.find((event) => activityLocalDay(event.start_time, timezone) === day)?.predicted_tss ?? 0) >= 80).length;
  const weeklyKm = plannedDays.size ? [...plannedDays].reduce((sum) => sum + 0, 0) : 0;
  const rows = [
    { label: "强度日间隔", value: hardDays ? `${hardDays} 个强度日按课表排列` : "课表未标记强度日", tone: hardDays ? "primary" as const : "muted" as const },
    { label: "周跑量", value: weeklyKm ? `计划覆盖 ${plannedDays.size} 天` : "计划未覆盖未来训练", tone: plannedDays.size ? "warn" as const : "muted" as const },
    { label: "减量期安排", value: targetDate ? "比赛日已纳入推演" : "未设置减量日期", tone: targetDate ? "primary" as const : "muted" as const },
  ];
  return <PageCard title="预计负荷走势" action={<Tag tone="warn">规划预测</Tag>}><LovableChart h={120} zero labels={forecastLabels} lines={[{ data: pmc.data.map((point) => point.ctl), cls: "stroke-fitness", label: "CTL", format: (v) => v.toFixed(1) }, { data: pmc.data.map((point) => point.tsb), cls: "stroke-form", label: "TSB", format: (v) => v.toFixed(1) }, { data: future, cls: "stroke-fitness", dashed: true, label: "计划 CTL", format: (v) => v.toFixed(1) }]} /><LovableLegend items={[{ label: "CTL 体能", cls: "bg-fitness" }, { label: "TSB 状态", cls: "bg-form" }, { label: "计划推演", cls: "border border-dashed border-fitness" }]} /><p className="mt-2 text-caption1 text-muted-foreground">{future.length ? "虚线按已保存计划的预计 TSS 计算，未安排日期按休息处理。" : "尚无未来计划负荷，当前仅展示历史记录。"}</p><div className="mt-3 space-y-2">{rows.map((row) => <div key={row.label} className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">{row.label}</span><Tag tone={row.tone}>{row.value}</Tag></div>)}</div></PageCard>;
}
