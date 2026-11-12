import { Bar, PageCard } from "@shared/ui/Lovable";
import type { WeekProgress } from "@features/today/hooks/useWeeklyProgress";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";

export function LovableWeekProgress({ week, activities, events, timezone }: {
  week: WeekProgress | null;
  activities: ActivitySummary[];
  events: CalendarEventDTO[];
  timezone: string;
}) {
  const duration = activities.reduce((sum, activity) => sum + (activity.duration_s ?? 0), 0) / 3600;
  const plannedDuration = events.reduce((sum, event) => sum + (event.workout_prescription?.duration_min ?? 0), 0) / 60;
  const rows = [
    { label: "跑量", value: (week?.actual_distance_m ?? 0) / 1000, plan: (week?.planned_distance_m ?? 0) / 1000, unit: "km", digits: 1 },
    { label: "时长", value: duration, plan: plannedDuration, unit: "h", digits: 1 },
    { label: "TSS", value: week?.actual_tss ?? 0, plan: week?.planned_tss ?? 0, unit: "", digits: 0 },
  ];
  const hasPlan = rows.some((row) => row.plan > 0);
  return <PageCard title="本周进度" action={hasPlan ? undefined : <span className="text-caption1 text-muted-foreground">无课表，按实际累计</span>}><div className="space-y-3">{rows.map((row) => {
    // 没有计划时进度条没有目标可量：满条表示当前累计，读数只写实际值。
    const barMax = row.plan > 0 ? row.plan : row.value > 0 ? row.value : 1;
    return <div key={row.label}><div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">{row.label}</span><span className="num text-sm">{row.value.toFixed(row.digits)}{row.plan > 0 ? ` / ${row.plan.toFixed(row.digits)}` : ""} {row.unit}</span></div><Bar value={row.value} max={barMax} tone={row.plan > 0 ? undefined : "bg-muted-foreground/40"} /></div>;
  })}</div><div className="mt-4 flex justify-between">{Array.from({ length: 7 }, (_, index) => {
    const day = new Date(); day.setDate(day.getDate() - ((day.getDay() + 6) % 7) + index);
    const key = day.toISOString().slice(0, 10);
    const done = activities.some((activity) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(activity.start_time)) === key);
    const planned = events.some((event) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(event.start_time)) === key);
    return <div key={key} className="flex flex-col items-center gap-1 text-caption1 text-muted-foreground"><span className={`h-3 w-3 rounded-full ${done ? "bg-primary" : planned ? "border border-muted-foreground/40" : "bg-secondary"}`} />{"一二三四五六日"[index]}</div>;
  })}</div></PageCard>;
}
