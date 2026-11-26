"use client";

import { Button } from "@shared/ui/button";
import { computeRange, toISODate } from "@shared/lib/format";

interface DateRangePickerProps {
  readonly from: string;
  readonly to: string;
  readonly onChange: (from: string, to: string) => void;
  readonly fromLabel?: string;
  readonly toLabel?: string;
  /** Hide 本周 / 本月 / 近 90 天 / 今年 where the surface already offers its own presets. */
  readonly showQuickRanges?: boolean;
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

const QUICK_RANGES = [
  { id: "week", label: "本周", build: getWeekRange },
  { id: "month", label: "本月", build: getMonthRange },
  { id: "90d", label: "近 90 天", build: () => computeRange(90) },
  { id: "year", label: "今年", build: getYearRange },
] as const;

export function DateRangePicker({
  from,
  to,
  onChange,
  fromLabel = "开始日期",
  toLabel = "结束日期",
  showQuickRanges = true,
}: DateRangePickerProps) {
  const handleFromChange = (nextFrom: string) => {
    if (nextFrom && to && nextFrom > to) {
      onChange(nextFrom, nextFrom);
      return;
    }
    onChange(nextFrom, to);
  };

  const handleToChange = (nextTo: string) => {
    if (nextTo && from && nextTo < from) {
      onChange(nextTo, nextTo);
      return;
    }
    onChange(from, nextTo);
  };

  return (
    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <input
          type="date"
          aria-label={fromLabel}
          value={from}
          max={to || undefined}
          onChange={(e) => handleFromChange(e.target.value)}
          className="focus-ring min-h-[44px] min-w-0 flex-1 rounded-lg border border-border-default bg-surface-card px-3 py-2 text-subheadline text-text-primary transition-colors hover:border-accent focus:border-accent focus:outline-none sm:flex-none"
        />
        <span className="text-subheadline text-text-muted">至</span>
        <input
          type="date"
          aria-label={toLabel}
          value={to}
          min={from || undefined}
          onChange={(e) => handleToChange(e.target.value)}
          className="focus-ring min-h-[44px] min-w-0 flex-1 rounded-lg border border-border-default bg-surface-card px-3 py-2 text-subheadline text-text-primary transition-colors hover:border-accent focus:border-accent focus:outline-none sm:flex-none"
        />
      </div>
      <div className={`w-full flex-wrap items-center gap-1 sm:w-auto ${showQuickRanges ? "flex" : "hidden"}`}>
        {QUICK_RANGES.map((preset) => {
          const target = preset.build();
          const active = from === target.from && to === target.to;
          return (
            <Button
              key={preset.id}
              type="button"
              variant={active ? "secondary" : "ghost"}
              aria-pressed={active}
              onClick={() => onChange(target.from, target.to)}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
