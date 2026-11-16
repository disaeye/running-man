"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageCard } from "@shared/ui/Lovable";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import { dayKeyOffset, weekdayIndex } from "@shared/lib/training-day";
import { groupTrainingByDay, trainingDayStatus } from "@features/calendar/lib/training-calendar";
import { loadScale } from "@features/calendar/lib/training-week";
import { getSportConfig } from "@shared/config/sport-config";
import { workoutTypeLabel } from "@features/today/lib/session-label";
import { JumpToDate } from "@features/calendar/components/JumpToDate";

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
 * 负荷回看。过去与今日只统计已记录实际负荷，未来日才展示计划预期负荷；
 * 档位由近 8 周有值日的分位固定，选中任意日期可直达日详情与编排抽屉。
 */
export function TrainingMonthView({
  activities, events, timezone, today, month, scaleDays, onMonthChange, onSelectDate,
}: {
  activities: readonly ActivitySummary[];
  events: readonly CalendarEventDTO[];
  timezone: string;
  today: string;
  month: string;
  scaleDays: readonly number[];
  onMonthChange: (delta: number) => void;
  onSelectDate?: (day: string) => void;
}) {
  const monthKey = month;
  const monthLabel = Number(monthKey.slice(5));
  const firstOfMonth = `${monthKey}-01`;
  const gridStart = dayKeyOffset(firstOfMonth, -weekdayIndex(firstOfMonth));
  const days = Array.from({ length: 42 }, (_, index) => dayKeyOffset(gridStart, index));
  const [selected, setSelected] = useState<string | null>(null);
  const grouped = groupTrainingByDay(activities, events, timezone);
  const scale = loadScale(scaleDays);

  const loadInfo = (iso: string): { tss: number | null; known: boolean } => {
    const items = grouped.get(iso);
    if (!items) return { tss: 0, known: true };
    if (items.activities.length > 0) {
      const recorded = items.activities.filter((a) => a.tss != null);
      if (recorded.length === 0) return { tss: null, known: false };
      return { tss: recorded.reduce((sum, a) => sum + (a.tss ?? 0), 0), known: true };
    }
    if (iso > today && items.events.length > 0) {
      const planned = items.events.filter((e) => e.predicted_tss != null);
      if (planned.length === 0) return { tss: null, known: false };
      return { tss: planned.reduce((sum, e) => sum + (e.predicted_tss ?? 0), 0), known: true };
    }
    return { tss: 0, known: true };
  };

  const selectedItems = selected ? grouped.get(selected) : undefined;
  const selectedLoad = selected ? loadInfo(selected) : null;

  // 「跳到日期」落在其他月份时需要切月：delta 语义是相对当前月的偏移量。
  const monthDelta = (targetDay: string) =>
    (Number(targetDay.slice(0, 4)) - Number(month.slice(0, 4))) * 12
    + (Number(targetDay.slice(5, 7)) - Number(month.slice(5, 7)));

  const returnToToday = () => {
    const delta = monthDelta(today);
    if (delta !== 0) onMonthChange(delta);
    setSelected(today);
    onSelectDate?.(today);
  };

  const jumpTo = (day: string) => {
    const delta = monthDelta(day);
    if (delta !== 0) onMonthChange(delta);
    setSelected(day);
    onSelectDate?.(day);
  };

  return <PageCard title={`${monthLabel} 月训练日历`} action={<div className="flex items-center gap-1">
    <button type="button" onClick={returnToToday} aria-label="回到今天" data-testid="month-back-to-today" className="tactile flex h-11 items-center rounded-full px-2 text-caption1 text-text-muted hover:bg-secondary">今天</button>
    <JumpToDate onJump={jumpTo} />
    <button type="button" onClick={() => onMonthChange(-1)} aria-label="上一月" className="tactile flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:bg-secondary"><ChevronLeft className="h-4 w-4" /></button>
    <button type="button" onClick={() => onMonthChange(1)} aria-label="下一月" className="tactile flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:bg-secondary"><ChevronRight className="h-4 w-4" /></button>
  </div>}>
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption1 text-text-muted" data-testid="month-legend">
      <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-success" />已完成</span>
      <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-fitness" />已计划</span>
      <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-accent" />完成 + 计划</span>
      <span className="ml-auto">过去/今日记实际 · 未来日记计划 · 档位按近 8 周固定分位</span>
    </div>
    <div className="grid grid-cols-7 gap-1 text-center text-caption1 text-text-muted">{"一二三四五六日".split("").map((day) => <span key={day}>{day}</span>)}</div>
    <div className="mt-1 grid grid-cols-7 gap-1" data-testid="plan-month-grid">{days.map((iso) => {
      const items = grouped.get(iso);
      const status = trainingDayStatus(items);
      const info = loadInfo(iso);
      const tss = info.tss ?? 0;
      const level = scale(tss);
      const count = (items?.activities.length ?? 0) + (items?.events.length ?? 0);
      const inMonth = iso.slice(0, 7) === monthKey;
      const tssLabel = !info.known ? "，TSS 未记录" : tss ? `，TSS ${Math.round(tss)}，负荷 ${level} 档` : "";
      const label = `${iso}，${STATUS_TEXT[status]}${count ? `，${count} 项` : ""}${tssLabel}`;
      return <button type="button" key={iso} data-testid={`plan-month-day-${iso}`} data-status={status} data-tss={info.known ? Math.round(tss) : ""} data-level={level} title={label} aria-label={label} onClick={() => setSelected(iso)} aria-pressed={selected === iso} className={`tactile relative min-h-11 aspect-square overflow-hidden rounded-lg bg-surface-overlay/40 ${inMonth ? "" : "opacity-40"} ${iso === today ? "ring-1 ring-primary" : ""} ${selected === iso ? "ring-2 ring-primary" : ""}`}>
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {Number(selected.slice(5, 7))}月{Number(selected.slice(8))}日 · {selectedLoad?.known ? `TSS ${Math.round(selectedLoad.tss ?? 0)}` : `TSS ${NO_VALUE}`}
        </span>
        <span className="text-caption1 text-text-muted">{STATUS_TEXT[trainingDayStatus(selectedItems)]}</span>
      </div>
      {selectedItems && (selectedItems.activities.length + selectedItems.events.length) > 0 ? (
        <ul className="mt-2 space-y-1">
          {selectedItems.events.map((item) => <li key={item.event_id} className="flex items-center gap-2 text-text-muted"><i className="size-2 rounded-full bg-fitness" />计划 · {item.name || workoutTypeLabel(item.training_type ?? item.sport_type ?? "training")}</li>)}
          {selectedItems.activities.map((item) => (
            <li key={item.activity_id} className="flex items-center gap-2">
              <i className="size-2 rounded-full bg-success" />
              <Link href={`/activities/${item.activity_id}`} className="hover:underline">
                {item.name?.trim() || getSportConfig(item.sport).label}
              </Link>
              <span className="num text-caption1 text-text-muted">
                · {item.tss != null ? `TSS ${Math.round(item.tss)}` : `TSS ${NO_VALUE}`}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-1 text-caption1 text-text-muted">这一天没有记录或计划。</p>}
      {onSelectDate ? (
        <div className="mt-2 border-t border-border-subtle pt-2">
          <button
            type="button"
            onClick={() => onSelectDate(selected)}
            className="tactile inline-flex min-h-11 items-center text-caption1 font-medium text-accent-strong hover:underline"
          >
            查看详情 / 编排这一天
          </button>
        </div>
      ) : null}
    </div> : null}
  </PageCard>;
}
