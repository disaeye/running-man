"use client";

import { SlidingIndicator } from "@shared/ui/SlidingIndicator";
import { CALENDAR_VIEWS, type CalendarView } from "@features/calendar/lib/calendar-view";
import type { SportFamily } from "@shared/config/sport-config";

const VIEW_LABELS = { week: "本周", month: "负荷", list: "记录" } as const;
const SPORT_FILTERS: readonly { key: SportFamily | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "running", label: "跑步" },
  { key: "strength", label: "力量训练" },
];

export function TrainingFilterTabs({
  view,
  family,
  onFamilyChange,
  onViewChange,
}: {
  readonly view: CalendarView;
  readonly family: SportFamily | "all";
  readonly onFamilyChange: (next: SportFamily | "all") => void;
  readonly onViewChange: (next: CalendarView) => void;
}) {
  return (
    <>
      {view !== "list" ? (
        <div className="relative flex flex-wrap gap-2">
          <SlidingIndicator
            variant="underline"
            options={SPORT_FILTERS.map((option) => ({ key: option.key, selected: family === option.key }))}
          />
          {SPORT_FILTERS.map((option) => (
            <button
              type="button"
              key={option.key}
              data-indicator-key={option.key}
              onClick={() => onFamilyChange(option.key)}
              aria-pressed={family === option.key}
              className={`tactile relative z-10 inline-flex min-h-11 items-center rounded-full border px-3.5 text-xs ${family === option.key ? "border-primary bg-primary/15 text-accent-strong" : "border-border-default text-text-muted"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative flex rounded-full bg-secondary p-1" role="tablist">
        <SlidingIndicator
          variant="accent-pill"
          options={CALENDAR_VIEWS.map((value) => ({ key: value, selected: view === value }))}
        />
        {CALENDAR_VIEWS.map((value) => (
          <button
            type="button"
            key={value}
            data-indicator-key={value}
            role="tab"
            aria-selected={view === value}
            onClick={() => onViewChange(value)}
            className={`tactile relative z-10 inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-transparent px-3 text-xs font-medium ${view === value ? "text-primary-foreground" : "text-text-muted hover:text-text-primary"}`}
          >
            {VIEW_LABELS[value]}
          </button>
        ))}
      </div>
    </>
  );
}
