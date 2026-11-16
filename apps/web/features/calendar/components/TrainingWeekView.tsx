"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Tag } from "@shared/ui/Lovable";
import { getSportConfig } from "@shared/config/sport-config";
import { formatDuration, formatPaceFromSeconds } from "@shared/lib/format";
import { workoutTypeLabel } from "@features/today/lib/session-label";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { JumpToDate } from "./JumpToDate";
import { periodLabel } from "../lib/training-week";
import type { WeekDay, WeekModel } from "../lib/training-week";

const STATE_LABEL: Record<WeekDay["state"], string> = {
  completed: "已完成",
  partial: "部分完成",
  upcoming: "待完成",
  missed: "未完成",
  unplanned: "没有安排",
  empty: "没有安排",
};

const STATE_TONE: Record<WeekDay["state"], "info" | "primary" | "warn" | "outline"> = {
  completed: "info",
  partial: "warn",
  upcoming: "primary",
  missed: "warn",
  unplanned: "outline",
  empty: "outline",
};

/** 本周执行：只渲染有活动、有计划或今天的日子，不让空天铺满一屏。 */
export function TrainingWeekView({ model, today, onWeekChange, onSelectDate, onBackToToday, onJumpToDate }: {
  model: WeekModel;
  today: string;
  onWeekChange: (delta: number) => void;
  onSelectDate: (day: string) => void;
  /** 周视图的「回到今天」：直接打开今天的单日抽屉。 */
  onBackToToday: () => void;
  /** 跳到任意日期：同样落成单日抽屉，比逐周翻页快得多。 */
  onJumpToDate: (day: string) => void;
}) {
  return (
    <div className="space-y-2" data-testid="plan-week-grid">
      <div className="sticky top-0 z-20 -mx-1 flex items-center justify-between gap-2 bg-surface-card px-1 py-1">
        <span className="num text-caption1 text-text-muted">
          {periodLabel(model.comparison.from, model.comparison.to)}
        </span>
        <div className="flex items-center gap-1">
          <JumpToDate onJump={onJumpToDate} />
          <button type="button" onClick={() => onBackToToday()} aria-label="回到今天" data-testid="week-back-to-today" className="tactile flex h-11 items-center rounded-full px-2 text-caption1 text-text-muted hover:bg-secondary">今天</button>
          <button type="button" onClick={() => onWeekChange(-1)} aria-label="上一周" className="tactile flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:bg-secondary"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => onWeekChange(1)} aria-label="下一周" className="tactile flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:bg-secondary"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {model.days.map((day) => <DayRow key={day.day} day={day} today={today} onSelectDate={onSelectDate} />)}

      {model.hiddenCount > 0 ? (
        <p className="px-1 py-2 text-caption1 text-text-muted" data-testid="week-hidden-days">
          本周另有 {model.hiddenCount} 天没有记录
        </p>
      ) : null}
    </div>
  );
}

function DayRow({ day, today, onSelectDate }: {
  readonly day: WeekDay;
  readonly today: string;
  readonly onSelectDate: (day: string) => void;
}) {
  const label = `周${"一二三四五六日"[weekdayOf(day.day)]}`;
  return (
    <div
      data-testid={`plan-week-day-${day.day}`}
      className={`surface p-3 ${day.isToday ? "ring-1 ring-primary" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onSelectDate(day.day)}
          aria-label={`编辑 ${day.day} 训练`}
          className="tactile flex min-h-11 items-center gap-2 text-left"
        >
          <span className="text-caption1 text-text-muted">{label}</span>
          <span className={`num text-lg font-semibold ${day.day === today ? "text-accent-strong" : ""}`}>
            {day.day.slice(8)}
          </span>
        </button>
        <Tag tone={STATE_TONE[day.state]}>{STATE_LABEL[day.state]}</Tag>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <PlanColumn day={day} />
        <ActualColumn day={day} />
      </div>
    </div>
  );
}

function PlanColumn({ day }: { readonly day: WeekDay }) {
  return (
    <div className="rounded-lg bg-surface-overlay/50 p-2.5">
      <div className="text-caption1 font-medium text-text-muted">计划</div>
      {day.events.length === 0 ? (
        <p className="mt-1 text-caption1 text-text-muted">没有编排</p>
      ) : (
        <ul className="mt-1 space-y-1.5">
          {day.events.map((event) => {
            const prescription = event.workout_prescription;
            const match = day.eventMatches.get(event.event_id);
            const showEventBadge = match && (day.events.length > 1 || day.state === "partial");
            return (
              <li key={event.event_id} data-testid={`week-plan-${event.event_id}`} className="text-caption1">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-text-primary">{event.name || workoutTypeLabel(event.training_type ?? event.sport_type ?? "training")}</span>
                  {showEventBadge && match ? (
                    <span className={`text-caption1 ${match.ambiguous ? "text-warn" : "text-text-muted"}`}>
                      {match.ambiguous ? "待确认" : STATE_LABEL[match.status]}
                    </span>
                  ) : null}
                </div>
                <div className="num text-text-muted">
                  {prescription ? `${Math.round(prescription.duration_min)} min` : "时长未记录"}
                  {event.predicted_distance_m != null ? ` · ${(event.predicted_distance_m / 1000).toFixed(1)} km` : ""}
                  {event.predicted_tss != null ? ` · TSS ${Math.round(event.predicted_tss)}` : ""}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ActualColumn({ day }: { readonly day: WeekDay }) {
  const hasMissed = day.events.some((e) => day.eventMatches.get(e.event_id)?.status === "missed");
  return (
    <div className="rounded-lg bg-surface-overlay/50 p-2.5">
      <div className="text-caption1 font-medium text-text-muted">实际</div>
      {day.activities.length === 0 ? (
        <p className="mt-1 text-caption1 text-text-muted">
          {hasMissed ? "这一天没有完成记录" : "还没有记录"}
        </p>
      ) : (
        <ul className="mt-1 space-y-1">
          {day.activities.map((activity) => (
            <li key={activity.activity_id} data-testid={`week-activity-${activity.activity_id}`}>
              <Link href={`/activities/${activity.activity_id}`} className="text-caption1 text-text-primary hover:underline">
                {activity.name?.trim() || getSportConfig(activity.sport).label}
              </Link>
              <div className="num text-text-muted">
                {activity.distance_m != null ? `${(activity.distance_m / 1000).toFixed(2)} km · ` : ""}
                {formatDuration(activity.duration_s)}
                {activity.avg_speed ? ` · ${formatPaceFromSeconds(Math.round(1000 / activity.avg_speed))}/km` : ""}
                {activity.tss != null ? ` · TSS ${Math.round(activity.tss)}` : ` · TSS ${NO_VALUE}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function weekdayOf(day: string): number {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;
}
