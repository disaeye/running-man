"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageCard } from "@shared/ui/Card";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";
import { dayKeyOffset, weekdayIndex } from "@shared/lib/training-day";
import { groupTrainingByDay, trainingDayStatus } from "@features/calendar/lib/training-calendar";
import { loadScale } from "@features/calendar/lib/training-week";
import { shiftAnchorMonth } from "@features/calendar/lib/view-range";
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

function quantileLegend(thresholds: readonly number[]): string {
  const sorted = [...thresholds].filter((value) => value > 0).sort((a, b) => a - b);
  if (sorted.length < 4) return "档位按近 8 周固定分位";
  const cut = (ratio: number): number =>
    Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0);
  const b1 = cut(0.25);
  const b2 = cut(0.5);
  const b3 = cut(0.75);
  return `档位按近 8 周固定分位（1档 ≤${b1} · 2档 ≤${b2} · 3档 ≤${b3} · 4档 >${b3} TSS）`;
}

export function TrainingMonthView({
  activities,
  events,
  timezone,
  today,
  anchor,
  scaleDays,
  viewControl,
  onAnchorChange,
  onSelectDate,
}: {
  activities: readonly ActivitySummary[];
  events: readonly CalendarEventDTO[];
  timezone: string;
  today: string;
  /** 当前月份内的一天；翻月时按它位移。 */
  anchor: string;
  scaleDays: readonly number[];
  viewControl: React.ReactNode;
  onAnchorChange: (anchor: string | null) => void;
  onSelectDate: (day: string) => void;
}) {
  const monthKey = anchor.slice(0, 7);
  const monthLabel = Number(monthKey.slice(5));
  const isCurrentMonth = monthKey === today.slice(0, 7);
  const firstOfMonth = `${monthKey}-01`;
  const gridStart = dayKeyOffset(firstOfMonth, -weekdayIndex(firstOfMonth));
  const days = Array.from({ length: 42 }, (_, index) => dayKeyOffset(gridStart, index));
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

  return (
    <PageCard
      title={`${monthLabel} 月训练日历`}
      action={
        <div className="sticky top-0 z-20 -mt-1 flex flex-wrap items-center gap-1 bg-surface-card py-1">
          <span data-testid="calendar-view-switch">{viewControl}</span>
          <button type="button" onClick={() => onAnchorChange(null)} aria-label="回到今天" data-testid="month-back-to-today" disabled={isCurrentMonth} className="tactile flex h-11 items-center rounded-full px-2 text-caption1 text-text-muted hover:bg-secondary disabled:opacity-40">今天</button>
          <JumpToDate onJump={onAnchorChange} defaultDate={today} />
          <button type="button" onClick={() => onAnchorChange(shiftAnchorMonth(anchor, -1))} aria-label="上一月" className="tactile flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:bg-secondary"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => onAnchorChange(shiftAnchorMonth(anchor, 1))} aria-label="下一月" className="tactile flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:bg-secondary"><ChevronRight className="h-4 w-4" /></button>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption1 text-text-muted" data-testid="month-legend">
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-success" />已完成</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-fitness" />已计划</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-accent" />完成 + 计划</span>
        <span className="ml-auto" title={quantileLegend(scaleDays)}>颜色深浅代表相对负荷</span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-caption1 text-text-muted">
        {"一二三四五六日".split("").map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1" data-testid="plan-month-grid">
        {days.map((iso) => {
          const items = grouped.get(iso);
          const status = trainingDayStatus(items);
          const info = loadInfo(iso);
          const tss = info.tss ?? 0;
          const level = scale(tss);
          const count = (items?.activities.length ?? 0) + (items?.events.length ?? 0);
          const inMonth = iso.slice(0, 7) === monthKey;
          const tssLabel = !info.known ? "，TSS 未记录" : tss ? `，TSS ${Math.round(tss)}，负荷 ${level} 档` : "";
          const label = `${iso}，${STATUS_TEXT[status]}${count ? `，${count} 项` : ""}${tssLabel}，点击查看详情或编排`;
          return (
            <button
              type="button"
              key={iso}
              data-testid={`plan-month-day-${iso}`}
              data-status={status}
              data-tss={info.known ? Math.round(tss) : ""}
              data-level={level}
              title={label}
              aria-label={label}
              onClick={() => onSelectDate(iso)}
              className={`tactile relative aspect-square min-h-11 overflow-hidden rounded-lg bg-surface-overlay/40 ${inMonth ? "" : "opacity-40"} ${iso === today ? "ring-1 ring-primary" : ""}`}
            >
              <span className="absolute inset-x-1 top-1 flex justify-end" aria-hidden>
                <i className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} />
              </span>
              <span className="absolute inset-x-1 bottom-4 flex items-end gap-0.5" aria-hidden>
                {[1, 2, 3, 4].map((step) => (
                  <i key={step} className={`h-1 flex-1 rounded-sm ${step <= level ? "bg-primary" : "bg-border-subtle"}`} />
                ))}
              </span>
              <span className="num absolute inset-x-0 bottom-0.5 text-center text-caption1">{Number(iso.slice(8))}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-caption1 text-text-muted">
        点击任意日期查看当天的回顾、补录或编排。
        {isCurrentMonth ? "" : " 当前显示的不是本月，可点「今天」返回。"}
      </p>
    </PageCard>
  );
}
