"use client";

import { SlidingIndicator } from "@shared/ui/SlidingIndicator";
import type { CalendarSportFamily } from "../lib/calendar-url-state";

const SPORT_FILTERS: readonly { key: CalendarSportFamily; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "running", label: "跑步" },
  { key: "strength", label: "力量训练" },
];

/** 日历顶部的运动家族筛选；只影响日历内容，与二级导航互不干扰。 */
export function TrainingFamilyFilter({
  family,
  onChange,
}: {
  readonly family: CalendarSportFamily;
  readonly onChange: (next: CalendarSportFamily) => void;
}) {
  return (
    <div className="relative flex flex-wrap gap-2">
      <SlidingIndicator
        variant="underline"
        options={SPORT_FILTERS.map((option) => ({
          key: option.key,
          selected: family === option.key,
        }))}
      />
      {SPORT_FILTERS.map((option) => (
        <button
          type="button"
          key={option.key}
          data-indicator-key={option.key}
          onClick={() => onChange(option.key)}
          aria-pressed={family === option.key}
          className={`tactile relative z-10 inline-flex min-h-11 items-center gap-1 rounded-full border px-3.5 text-xs ${
            family === option.key
              ? "border-primary bg-primary/15 text-accent-strong"
              : "border-border-default text-text-muted hover:text-text-primary"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
