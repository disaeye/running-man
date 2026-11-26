"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { periodLabel } from "../lib/training-week";
import type { WeekModel } from "../lib/training-week";
import { shiftAnchorWeek } from "../lib/view-range";
import type { DaySheetMode } from "./CalendarDaySheet";
import { WeekDayRow } from "./WeekDayRow";

export function TrainingWeekView({
  model,
  anchor,
  today,
  viewControl,
  onAnchorChange,
  onSelectDate,
}: {
  model: WeekModel;
  /** 当前周的锚点日；翻周时按它位移。 */
  anchor: string;
  today: string;
  viewControl: React.ReactNode;
  onAnchorChange: (anchor: string | null) => void;
  onSelectDate: (day: string, mode?: DaySheetMode) => void;
}) {
  const [direction, setDirection] = useState<"next" | "previous">("next");
  const isCurrentWeek = model.comparison.from <= today && today <= model.comparison.to;

  return (
    <div className="space-y-2" data-testid="plan-week-grid">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 bg-surface-card px-1 py-1">
        <span className="num min-w-0 truncate text-caption1 text-text-muted">
          {periodLabel(model.comparison.from, model.comparison.to)}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          <span className="shrink-0" data-testid="calendar-view-switch">{viewControl}</span>
          <button
            type="button"
            onClick={() => onAnchorChange(null)}
            aria-label="回到今天"
            data-testid="week-back-to-today"
            disabled={isCurrentWeek}
            className="tactile flex h-11 items-center rounded-full px-2 text-caption1 text-text-muted hover:bg-secondary disabled:opacity-40"
          >
            今天
          </button>
          <button type="button" onClick={() => { setDirection("previous"); onAnchorChange(shiftAnchorWeek(anchor, -1)); }} aria-label="上一周" className="tactile flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:bg-secondary"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => { setDirection("next"); onAnchorChange(shiftAnchorWeek(anchor, 1)); }} aria-label="下一周" className="tactile flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:bg-secondary"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div key={model.comparison.from} data-week-direction={direction} className="week-shift space-y-1.5">
        {model.days.map((day) => (
          <WeekDayRow key={day.day} day={day} today={today} onSelectDate={onSelectDate} />
        ))}
      </div>
    </div>
  );
}
