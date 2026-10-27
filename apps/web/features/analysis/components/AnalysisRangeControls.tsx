"use client";

// Shared range controls used by every analysis tab so users see one coherent
// date-range surface. Backed by the page-level AnalysisRangeContext — props
// remain typed (dateRange, onDateRangeChange) so individual tabs can stay
// testable without React context.

import { Button } from "@shared/ui/button";
import { DateRangePicker } from "@shared/ui/DateRangePicker";
import { rangeEndingOn, useAthleteTimezone } from "@shared/lib/training-day";
import {
  ANALYSIS_RANGE_PRESETS,
  isPresetActive,
  type AnalysisDateRange,
} from "../lib/analysis-range";

interface AnalysisRangeControlsProps {
  readonly dateRange: AnalysisDateRange;
  readonly onDateRangeChange: (next: AnalysisDateRange) => void;
  readonly className?: string;
}

export function AnalysisRangeControls({
  dateRange,
  onDateRangeChange,
  className,
}: AnalysisRangeControlsProps) {
  const timezone = useAthleteTimezone();
  return (
    <div
      className={`flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end ${className ?? ""}`.trim()}
      data-testid="analysis-range-controls"
    >
      <div
        className="flex w-full items-center gap-1 sm:w-auto"
        role="group"
        aria-label="区间预设"
      >
        {ANALYSIS_RANGE_PRESETS.map((preset) => {
          const days = preset.days;
          const active = isPresetActive(dateRange, days, timezone);
          return (
            <Button
              key={days}
              variant={active ? "default" : "ghost"}
              onClick={() => onDateRangeChange(rangeEndingOn(dateRange.to, days))}
              aria-pressed={active}
              className="flex-1 px-2 sm:flex-none"
            >
              {preset.label}
            </Button>
          );
        })}
      </div>
      <DateRangePicker
        from={dateRange.from}
        to={dateRange.to}
        onChange={(from, to) => onDateRangeChange({ from, to })}
        showQuickRanges={false}
      />
    </div>
  );
}
