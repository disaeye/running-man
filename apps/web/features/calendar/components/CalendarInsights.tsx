"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Calendar summaries on a phone: one row that opens the training progress card.
 *
 * Below `lg` the summary waits behind a toggle; from `lg` it is part of the
 * calendar column.
 */
export function CalendarInsights({ children }: { readonly children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        data-testid="calendar-insights-toggle"
        className="row-press focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl bg-surface-card px-4 text-left hover:bg-surface-overlay lg:hidden"
      >
        <span className="text-caption1 font-semibold text-text-secondary">训练概览</span>
        <span className="flex items-center gap-1 text-caption1 text-text-muted">
          {open ? "收起" : "展开"}
          {open ? (
            <ChevronUp className="size-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4" aria-hidden="true" />
          )}
        </span>
      </button>
      <div className={open ? "space-y-6" : "hidden space-y-6 lg:block"}>{children}</div>
    </>
  );
}
