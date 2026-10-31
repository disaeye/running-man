"use client";

import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import { activityLocalDay, athleteToday } from "@shared/lib/training-day";

export function TrainingMonthView({ activities, events, timezone, onSelectDate }: {
  activities: ActivitySummary[]; events: CalendarEventDTO[]; timezone: string; onSelectDate: (day: string) => void;
}) {
  const now = new Date(); const year = now.getFullYear(); const month = now.getMonth();
  const first = new Date(year, month, 1); const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(day.getDate() + index); return day; });
  const maxTss = Math.max(1, ...activities.map((activity) => activity.tss ?? 0), ...events.map((event) => event.predicted_tss ?? 0));
  const today = athleteToday(timezone);
  return <div><div className="grid grid-cols-7 pb-2 text-center text-caption1 text-muted-foreground">{"一二三四五六日".split("").map((day) => <span key={day}>{day}</span>)}</div><div className="grid grid-cols-7 gap-1">{days.map((day) => {
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const actual = activities.filter((activity) => activityLocalDay(activity.start_time, timezone) === iso);
    const planned = events.filter((event) => activityLocalDay(event.start_time, timezone) === iso);
    const tss = actual.reduce((sum, activity) => sum + (activity.tss ?? 0), 0) || planned.reduce((sum, event) => sum + (event.predicted_tss ?? 0), 0);
    return <button type="button" key={iso} onClick={() => onSelectDate(iso)} className={`relative flex aspect-square flex-col items-center justify-center gap-1 rounded-lg ${day.getMonth() === month ? "bg-secondary/60" : "opacity-30"} ${iso === today ? "ring-1 ring-primary" : ""}`}><span className="num text-sm">{day.getDate()}</span>{tss ? <><span className="h-1.5 w-1.5 rounded-full" style={{ background: `oklch(from var(--color-primary) l c h / ${0.2 + 0.8 * tss / maxTss})` }} /><span className="num text-caption1 text-muted-foreground">{Math.round(tss)}</span></> : null}</button>;
  })}</div></div>;
}
