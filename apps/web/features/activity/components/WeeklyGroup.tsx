"use client";

import { useState, type ReactNode } from "react";
import { formatDistance } from "@shared/lib/format";
import type { ActivitySummary } from "@shared/types/activity";

interface WeeklyGroupProps {
  weekLabel: string;
  weekRange: string;
  activities: ActivitySummary[];
  defaultExpanded: boolean;
  /** Optional header action (rendered outside the collapse toggle to avoid nested buttons). */
  action?: ReactNode;
  children: ReactNode;
}

export function WeeklyGroup({
  weekLabel,
  weekRange,
  activities,
  defaultExpanded,
  action,
  children,
}: WeeklyGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const count = activities.length;
  const totalDistance = activities.reduce((s, a) => s + (a.distance_m ?? 0), 0);
  const totalTss = activities.reduce((s, a) => s + (a.tss ?? 0), 0);

  return (
    <section className="overflow-hidden rounded-lg border border-border-subtle bg-surface-raised">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="focus-ring flex min-h-[44px] flex-1 items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-active"
        >
          <span
            aria-hidden="true"
            className={`inline-block text-text-secondary transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            ›
          </span>
          <span className="text-subheadline font-semibold text-text-primary">{weekLabel}</span>
          <span className="font-mono text-caption1 text-text-muted">{weekRange}</span>
          <span className="ml-auto flex items-center gap-3 font-mono text-caption1 text-text-secondary">
            <span>{count} 次</span>
            <span>{formatDistance(totalDistance)}</span>
            <span>TSS {Math.round(totalTss)}</span>
          </span>
        </button>
        {action && <div className="flex shrink-0 items-center pr-2">{action}</div>}
      </div>
      {expanded && (
        <div className="flex flex-col gap-2 border-t border-border-subtle p-2">{children}</div>
      )}
    </section>
  );
}
