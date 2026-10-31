"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Tag } from "@shared/ui/Lovable";
import { getSportConfig } from "@shared/config/sport-config";
import { formatDuration, formatPaceFromSeconds } from "@shared/lib/format";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import { activityLocalDay, athleteToday } from "@shared/lib/training-day";

export function TrainingWeekView({ activities, events, timezone, onSelectDate }: {
  activities: ActivitySummary[]; events: CalendarEventDTO[]; timezone: string; onSelectDate: (day: string) => void;
}) {
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => { const day = new Date(monday); day.setDate(day.getDate() + index); return day.toISOString().slice(0, 10); });
  const today = athleteToday(timezone);
  return <div className="space-y-1">{days.map((day, index) => {
    const actual = activities.filter((activity) => activityLocalDay(activity.start_time, timezone) === day);
    const planned = events.filter((event) => activityLocalDay(event.start_time, timezone) === day);
    const activity = actual[0]; const event = planned[0];
    return <button type="button" key={day} onClick={() => activity ? undefined : onSelectDate(day)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ${day === today ? "bg-secondary" : ""}`}><div className="w-10"><div className="text-[11px] text-muted-foreground">周{"一二三四五六日"[index]}</div><div className="num text-lg font-semibold">{day.slice(8)}</div></div><div className="flex-1">{activity ? <><div className="flex items-center gap-2"><Tag tone="primary">{getSportConfig(activity.sport).label}</Tag>{activity.is_race ? <Tag>比赛</Tag> : null}</div><div className="mt-1 font-medium">{activity.name?.trim() || getSportConfig(activity.sport).label}</div><div className="num mt-0.5 flex gap-3 text-xs text-muted-foreground">{activity.distance_m != null ? <span>{(activity.distance_m / 1000).toFixed(2)} km</span> : null}<span>{formatDuration(activity.duration_s ?? 0)}</span>{activity.avg_speed ? <span>{formatPaceFromSeconds(Math.round(1000 / activity.avg_speed))}/km</span> : null}</div></> : event ? <><Tag>计划</Tag><div className="mt-1 font-medium">{event.name || event.sport_type}</div><div className="num text-xs text-muted-foreground">{event.workout_prescription?.duration_min ?? 0}′ · TSS {Math.round(event.predicted_tss ?? 0)}</div></> : <span className="text-sm text-muted-foreground/60">休息</span>}</div>{activity ? <Link href={`/activities/${activity.activity_id}`} aria-label="查看活动"><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link> : event ? <ArrowRight className="h-4 w-4 text-muted-foreground" /> : null}</button>;
  })}</div>;
}
