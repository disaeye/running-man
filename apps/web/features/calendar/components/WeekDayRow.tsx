"use client";

import { Tag } from "@shared/ui/Badge";
import { ChevronRight } from "lucide-react";
import { getSportConfig } from "@shared/config/sport-config";
import { formatDuration } from "@shared/lib/format";
import { workoutTypeLabel } from "@features/today/lib/session-label";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import type { WeekDay } from "../lib/training-week";
import type { DaySheetMode } from "./CalendarDaySheet";

const STATE_LABEL: Record<WeekDay["state"], string> = {
  completed: "已完成",
  partial: "部分完成",
  upcoming: "待完成",
  missed: "未完成",
  unplanned: "没有安排",
  empty: "没有安排",
};

const STATE_TONE: Record<WeekDay["state"], "success" | "primary" | "warn" | "outline"> = {
  completed: "success",
  partial: "warn",
  upcoming: "primary",
  missed: "warn",
  unplanned: "outline",
  empty: "outline",
};

export function weekdayOf(day: string): number {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;
}

interface WeekDayRowProps {
  readonly day: WeekDay;
  readonly today: string;
  readonly onSelectDate: (day: string, mode?: DaySheetMode) => void;
}

/**
 * 周视图每日行：左侧日期标，右侧按「计划 → 实际」直接列出内容。
 * 空白日只留一个轻量入口，不再画两个空的内嵌框。
 */
export function WeekDayRow({ day, today, onSelectDate }: WeekDayRowProps) {
  const isToday = day.day === today;
  const empty = day.events.length === 0 && day.activities.length === 0;
  return (
    <button
      type="button"
      data-testid={`plan-week-day-${day.day}`}
      onClick={() => onSelectDate(day.day)}
      aria-label={`编辑 ${day.day} 训练`}
      className={`surface flex w-full items-start gap-3 p-3 text-left sm:p-3.5 ${isToday ? "ring-1 ring-accent-strong" : ""}`}
    >
      <DayBadge day={day.day} isToday={isToday} />
      <span className="min-w-0 flex-1 space-y-1">
        {day.events.map((event) => <EventLine key={event.event_id} event={event} />)}
        {day.activities.map((activity) => <ActivityLine key={activity.activity_id} activity={activity} />)}
        {empty ? <span className="block text-caption1 text-text-muted">+ 安排训练或补录活动</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <Tag tone={STATE_TONE[day.state]}>{STATE_LABEL[day.state]}</Tag>
        <ChevronRight className="size-4 text-text-muted" aria-hidden />
      </span>
    </button>
  );
}

function DayBadge({ day, isToday }: { readonly day: string; readonly isToday: boolean }) {
  const label = `周${"一二三四五六日"[weekdayOf(day)]}`;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-caption1 ${
      isToday ? "bg-accent/15 font-semibold text-accent-strong" : "bg-surface-overlay text-text-secondary"
    }`}>
      {isToday ? <span className="pulse-dot size-1.5 rounded-full bg-accent-strong" aria-hidden="true" /> : null}
      <span>{label}</span>
      <span className="num font-mono font-semibold">{day.slice(5)}</span>
    </span>
  );
}

function EventLine({ event }: { readonly event: CalendarEventDTO }) {
  const prescription = event.workout_prescription;
  const meta = prescription
    ? `${Math.round(prescription.duration_min)} min${event.predicted_distance_m != null ? ` · ${(event.predicted_distance_m / 1000).toFixed(1)} km` : ""}`
    : "";
  // 课表名自带「（16 分钟）」时，时长已经写在后面的元数据里，名称里不再重复。
  const rawName = event.name || workoutTypeLabel(event.training_type ?? event.sport_type ?? "training");
  const name = meta ? rawName.replace(/（\d+ 分钟）$/, "") : rawName;
  return (
    <span data-testid={`week-plan-${event.event_id}`} className="block text-caption1">
      <span className="font-medium text-text-muted">计划 · </span>
      <span className="font-medium text-text-primary">{name}</span>
      {meta ? <span className="num font-mono text-text-muted"> {meta}</span> : null}
    </span>
  );
}

function ActivityLine({ activity }: { readonly activity: ActivitySummary }) {
  const name = activity.name?.trim() || getSportConfig(activity.sport).label;
  const distance = activity.distance_m != null ? `${(activity.distance_m / 1000).toFixed(2)} km · ` : "";
  const tss = activity.tss != null ? ` · TSS ${Math.round(activity.tss)}` : ` · TSS ${NO_VALUE}`;
  return (
    <span data-testid={`week-activity-${activity.activity_id}`} className="block text-caption1">
      <span className="font-medium text-text-muted">实际 · </span>
      <span className="font-medium text-text-primary">{name}</span>
      <span className="num font-mono text-text-muted"> {distance}{formatDuration(activity.duration_s)}{tss}</span>
    </span>
  );
}
