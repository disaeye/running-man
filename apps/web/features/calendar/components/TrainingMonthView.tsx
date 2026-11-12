"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageCard } from "@shared/ui/Lovable";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import { dayKeyOffset, weekdayIndex } from "@shared/lib/training-day";
import { groupTrainingByDay, trainingDayStatus } from "@features/calendar/lib/training-calendar";
import { loadScale } from "@features/calendar/lib/training-week";
import { getSportConfig } from "@shared/config/sport-config";
import { workoutTypeLabel } from "@features/today/lib/session-label";

const STATUS_DOT: Record<string, string> = {
  empty: "bg-transparent",
  planned: "bg-fitness",
  completed: "bg-success",
  mixed: "bg-accent",
};

const STATUS_TEXT: Record<string, string> = {
  empty: "无训练",
  planned: "已计划",
  completed: "已完成",
  mixed: "完成 + 计划",
};

/**
 * 负荷回看。档位由近 8 周有值日的分位固定，跨月同一格高度代表同一负荷区间；
 * 状态只用圆点表达，取消渐变与高度叠加两套编码。
 */
export function TrainingMonthView({ activities, events, timezone, today, month, scaleDays, onMonthChange }: {
  activities: readonly ActivitySummary[];
  events: readonly CalendarEventDTO[];
  timezone: string;
  today: string;
  month: string;
  /** 近 8 周的每日 TSS，用于固定档位。 */
  scaleDays: readonly number[];
  onMonthChange: (delta: number) => void;
}) {
  const monthKey = month;
  const monthLabel = Number(monthKey.slice(5));
  const firstOfMonth = `${monthKey}-01`;
  const gridStart = dayKeyOffset(firstOfMonth, -weekdayIndex(firstOfMonth));
  const days = Array.from({ length: 42 }, (_, index) => dayKeyOffset(gridStart, index));
  const [selected, setSelected] = useState<string | null>(null);
  const grouped = groupTrainingByDay(activities, events, timezone);
  const scale = loadScale(scaleDays);

  const loadOf = (iso: string): number => {
    const items = grouped.get(iso);
    if (!items) return 0;
    const actual = items.activities.reduce((sum, a) => sum + (a.tss ?? 0), 0);
    const planned = items.events.reduce((sum, e) => sum + (e.predicted_tss ?? 0), 0);
    return actual > 0 ? actual : planned;
  };
  const selectedItems = selected ? grouped.get(selected) : undefined;

  return <PageCard title={`${monthLabel} 月训练日历`} action={<div className="flex items-center gap-1">
    <button type="button" onClick={() => onMonthChange(-1)} aria-label="上一月" className="tactile flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:bg-secondary"><ChevronLeft className="h-4 w-4" /></button>
    <button type="button" onClick={() => onMonthChange(1)} aria-label="下一月" className="tactile flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:bg-secondary"><ChevronRight className="h-4 w-4" /></button>
  </div>}>
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption1 text-text-muted" data-testid="month-legend">
      <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-success" />已完成</span>
      <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-fitness" />已计划</span>
      <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-accent" />完成 + 计划</span>
      <span className="ml-auto">档位按近 8 周固定分位 · 0–4 档</span>
    </div>
    <div className="grid grid-cols-7 gap-1 text-center text-caption1 text-text-muted">{"一二三四五六日".split("").map((day) => <span key={day}>{day}</span>)}</div>
    <div className="mt-1 grid grid-cols-7 gap-1" data-testid="plan-month-grid">{days.map((iso) => {
      const items = grouped.get(iso);
      const status = trainingDayStatus(items);
      const tss = loadOf(iso);
      const level = scale(tss);
      const count = (items?.activities.length ?? 0) + (items?.events.length ?? 0);
      const inMonth = iso.slice(0, 7) === monthKey;
      const label = `${iso}，${STATUS_TEXT[status]}${count ? `，${count} 项` : ""}${tss ? `，TSS ${Math.round(tss)}，负荷 ${level} 档` : ""}`;
      return <button type="button" key={iso} data-testid={`plan-month-day-${iso}`} data-status={status} data-tss={Math.round(tss)} data-level={level} title={label} aria-label={label} onClick={() => setSelected(iso)} aria-pressed={selected === iso} className={`tactile relative aspect-square overflow-hidden rounded-lg bg-surface-overlay/40 ${inMonth ? "" : "opacity-40"} ${iso === today ? "ring-1 ring-primary" : ""} ${selected === iso ? "ring-2 ring-primary" : ""}`}>
        <span className="absolute inset-x-1 top-1 flex justify-end" aria-hidden>
          <i className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} />
        </span>
        <span className="absolute inset-x-1 bottom-4 flex items-end gap-0.5" aria-hidden>
          {[1, 2, 3, 4].map((step) => <i key={step} className={`h-1 flex-1 rounded-sm ${step <= level ? "bg-primary" : "bg-border-subtle"}`} />)}
        </span>
        <span className="num absolute inset-x-0 bottom-0.5 text-center text-caption1">{Number(iso.slice(8))}</span>
      </button>;
    })}</div>
    {selected ? <div className="mt-3 rounded-lg bg-secondary p-3 text-sm" data-testid="month-day-detail">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{monthLabel}月{Number(selected.slice(8))}日 · TSS {Math.round(loadOf(selected))}</span>
        <span className="text-caption1 text-text-muted">{STATUS_TEXT[trainingDayStatus(selectedItems)]}</span>
      </div>
      {selectedItems && (selectedItems.activities.length + selectedItems.events.length) > 0 ? (
        <ul className="mt-2 space-y-1">
          {selectedItems.events.map((item) => <li key={item.event_id} className="flex items-center gap-2 text-text-muted"><i className="size-2 rounded-full bg-fitness" />计划 · {item.name || workoutTypeLabel(item.training_type ?? item.sport_type ?? "training")}</li>)}
          {selectedItems.activities.map((item) => <li key={item.activity_id} className="flex items-center gap-2"><i className="size-2 rounded-full bg-success" />{item.name?.trim() || getSportConfig(item.sport).label} · TSS {Math.round(item.tss ?? 0)}</li>)}
        </ul>
      ) : <p className="mt-1 text-caption1 text-text-muted">这一天没有记录或计划。</p>}
    </div> : null}
  </PageCard>;
}
