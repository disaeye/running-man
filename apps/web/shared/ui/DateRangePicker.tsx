"use client";

import { Button } from "@shared/ui/button";
import { toISODate } from "@shared/lib/format";

interface DateRangePickerProps {
  readonly from: string;
  readonly to: string;
  readonly onChange: (from: string, to: string) => void;
  readonly fromLabel?: string;
  readonly toLabel?: string;
  /** Hide 本周 / 本月 / 今年 where the surface already offers its own presets. */
  readonly showQuickRanges?: boolean;
}

function applyRange(
  builder: () => { from: string; to: string },
  onChange: (from: string, to: string) => void,
) {
  const { from, to } = builder();
  onChange(from, to);
}

function getWeekRange(): { from: string; to: string } {
  const now = new Date();
  const dow = now.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + offset);
  return { from: toISODate(mon), to: toISODate(now) };
}

function getMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: toISODate(first), to: toISODate(now) };
}

function getYearRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), 0, 1);
  return { from: toISODate(first), to: toISODate(now) };
}

export function DateRangePicker({
  from,
  to,
  onChange,
  fromLabel = "开始日期",
  toLabel = "结束日期",
  showQuickRanges = true,
}: DateRangePickerProps) {
  return (
    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <input
          type="date"
          aria-label={fromLabel}
          value={from}
          onChange={(e) => onChange(e.target.value, to)}
          className="focus-ring min-h-[44px] min-w-0 flex-1 rounded-lg border border-border-default bg-surface-card px-3 py-2 text-subheadline text-text-primary transition-colors hover:border-accent focus:border-accent focus:outline-none sm:flex-none"
        />
        <span className="text-subheadline text-text-muted">至</span>
        <input
          type="date"
          aria-label={toLabel}
          value={to}
          onChange={(e) => onChange(from, e.target.value)}
          className="focus-ring min-h-[44px] min-w-0 flex-1 rounded-lg border border-border-default bg-surface-card px-3 py-2 text-subheadline text-text-primary transition-colors hover:border-accent focus:border-accent focus:outline-none sm:flex-none"
        />
      </div>
      <div className={`w-full items-center gap-1 sm:w-auto ${showQuickRanges ? "flex" : "hidden"}`}>
        <Button variant="ghost" onClick={() => applyRange(getWeekRange, onChange)}>
          本周
        </Button>
        <Button variant="ghost" onClick={() => applyRange(getMonthRange, onChange)}>
          本月
        </Button>
        <Button variant="ghost" onClick={() => applyRange(getYearRange, onChange)}>
          今年
        </Button>
      </div>
    </div>
  );
}
