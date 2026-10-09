"use client";

// Shared range controls used by every analysis tab so users see one coherent
// date-range surface. Backed by the page-level AnalysisRangeContext — props
// remain typed (dateRange, onDateRangeChange) so individual tabs can stay
// testable without React context.

import { Button } from "@shared/ui/button";
import { DateRangePicker } from "@shared/ui/DateRangePicker";
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
  return (
    <div
      className={`flex flex-wrap items-center justify-end gap-2 ${className ?? ""}`.trim()}
      data-testid="analysis-range-controls"
    >
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label="区间预设"
      >
        {ANALYSIS_RANGE_PRESETS.map((preset) => {
          const days = preset.days;
          const active = isPresetActive(dateRange, days);
          return (
            <Button
              key={days}
              variant={active ? "default" : "ghost"}
              onClick={() =>
                onDateRangeChange(computePresetRange(days, dateRange.to))
              }
              aria-pressed={active}
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
      />
    </div>
  );
}

function computePresetRange(days: number, today: string): AnalysisDateRange {
  const [yearRaw, monthRaw, dayRaw] = today.split("-").map((part) => Number(part));
  const year = yearRaw ?? 1970;
  const month = monthRaw ?? 1;
  const day = dayRaw ?? 1;
  const todayDate = new Date(year, month - 1, day);
  const fromDate = new Date(todayDate);
  fromDate.setDate(todayDate.getDate() - (days - 1));
  const fromIso = toISODateLocal(fromDate);
  return { from: fromIso, to: today };
}

function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
