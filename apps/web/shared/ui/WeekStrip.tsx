"use client";

import { type ReactNode } from "react";

export type WeekStripStatus = "done" | "planned" | "missed" | "rest";

export interface WeekStripDay {
  readonly iso: string;
  readonly weekday: string;
  readonly dateNum: number;
  readonly isToday: boolean;
  readonly status: WeekStripStatus;
}

const DOT: Record<WeekStripStatus, string> = {
  done: "bg-success",
  planned: "bg-accent",
  missed: "bg-border-default",
  rest: "bg-transparent",
};

/**
 * Seven days as a strip — the spine of a training week.
 *
 * Runna opens its Today screen with this strip, Google Calendar and Apple's
 * Fitness use the same shape: the week's shape is legible before any text, and
 * a day is one tap. The strip is read-only on the home screen and a selector on
 * the calendar.
 */
export function WeekStrip({
  days,
  selectedIso,
  onSelect,
  className = "",
}: {
  readonly days: readonly WeekStripDay[];
  readonly selectedIso?: string | null;
  readonly onSelect?: (iso: string) => void;
  readonly className?: string;
}) {
  return (
    <div className={`grid grid-cols-7 gap-1 ${className}`.trim()} role="group" aria-label="本周七天">
      {days.map((day) => {
        const isSelected = selectedIso === day.iso;
        const body: ReactNode = (
          <>
            <span
              className={`text-caption1 ${
                day.isToday ? "font-semibold text-accent-strong" : "text-text-muted"
              }`}
            >
              {day.weekday}
            </span>
            <span
              className={`flex size-8 items-center justify-center rounded-full font-mono text-subheadline tabular-nums ${
                isSelected
                  ? "bg-primary text-on-primary"
                  : day.isToday
                    ? "border border-accent text-accent-strong"
                    : "text-text-primary"
              }`}
            >
              {day.dateNum}
            </span>
            <span
              className={`size-1.5 rounded-full ${DOT[day.status]}`}
              aria-hidden="true"
            />
          </>
        );
        const className =
          "flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors";
        return onSelect ? (
          <button
            key={day.iso}
            type="button"
            onClick={() => onSelect(day.iso)}
            aria-pressed={isSelected}
            aria-label={`${day.weekday} ${day.dateNum} 日`}
            data-testid={`week-strip-${day.iso}`}
            className={`row-press ${className} focus-ring hover:bg-surface-overlay`}
          >
            {body}
          </button>
        ) : (
          <div key={day.iso} className={className} data-testid={`week-strip-${day.iso}`}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
