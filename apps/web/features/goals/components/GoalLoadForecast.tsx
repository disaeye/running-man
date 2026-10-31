"use client";

import { useMemo } from "react";
import { PageCard } from "@shared/ui/Lovable";
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
  if (!pmc.data.length) return <PageCard title="预计负荷走势"><p className="text-sm text-muted-foreground">尚无负荷记录，无法推演。</p></PageCard>;
  return <PageCard title="预计负荷走势" action={<span className="text-caption1 text-muted-foreground">基于当前计划</span>}><LovableChart h={120} zero lines={[{ data: pmc.data.map((point) => point.ctl), cls: "stroke-fitness" }, { data: pmc.data.map((point) => point.tsb), cls: "stroke-form" }, { data: future, cls: "stroke-fitness", dashed: true }]} /><LovableLegend items={[{ label: "CTL 体能", cls: "bg-fitness" }, { label: "TSB 状态", cls: "bg-form" }, { label: "计划推演", cls: "border border-dashed border-fitness" }]} /><p className="mt-2 text-caption1 text-muted-foreground">{future.length ? "虚线按已保存计划的预计 TSS 计算，未安排日期按休息处理。" : "尚无未来计划负荷，当前仅展示历史记录。"}</p><div className="mt-3 grid grid-cols-3 gap-2 text-center text-caption1 text-muted-foreground"><span>强度日按课表安排</span><span>周跑量以计划为准</span><span>{targetDate ? "比赛日已纳入" : "未设置减量日期"}</span></div></PageCard>;
}
