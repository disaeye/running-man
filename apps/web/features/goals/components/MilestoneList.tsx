"use client";

import { Check, Circle } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { Badge } from "@shared/ui/Badge";
import type { Milestone } from "@shared/types/goals";
import { formatDate } from "@shared/lib/format";

interface MilestoneListProps {
  milestones: Milestone[];
  onToggle?: (milestoneId: string) => void;
  goalUnit?: string | null;
}

export function MilestoneList({
  milestones,
  onToggle,
  goalUnit,
}: MilestoneListProps) {
  if (milestones.length === 0) return null;

  const upcoming = milestones.filter((m) => !m.achieved);
  const achieved = milestones.filter((m) => m.achieved);

  return (
    <Card>
      <h3 className="mb-4 text-subheadline font-semibold uppercase tracking-wider text-text-muted">
        里程碑
      </h3>

      {/* Upcoming milestones */}
      {upcoming.length > 0 && (
        <ul className="relative flex flex-col gap-0">
          {/* Timeline line */}
          <div className="absolute left-[13.5px] top-2 bottom-2 w-px bg-border-subtle" aria-hidden="true" />
          {upcoming.map((ms, idx) => (
            <MilestoneRow
              key={ms.milestone_id}
              milestone={ms}
              unit={goalUnit}
              onToggle={onToggle}
              first={idx === 0}
            />
          ))}
        </ul>
      )}

      {/* Achieved milestones */}
      {achieved.length > 0 && (
        <div className="mt-4 border-t border-border-subtle pt-4">
          <div className="mb-2 text-caption1 font-medium text-text-muted">
            已完成
          </div>
          <ul className="relative flex flex-col gap-0">
            {/* Timeline line */}
            <div className="absolute left-[13.5px] top-2 bottom-2 w-px bg-border-subtle" aria-hidden="true" />
            {achieved.map((ms, idx) => (
              <MilestoneRow
                key={ms.milestone_id}
                milestone={ms}
                unit={goalUnit}
                onToggle={onToggle}
                first={idx === 0}
              />
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function MilestoneRow({
  milestone,
  unit,
  onToggle,
  first,
}: {
  milestone: Milestone;
  unit?: string | null;
  onToggle?: (id: string) => void;
  first?: boolean;
}) {
  const isDone = milestone.achieved;

  return (
    <li
      className={`
        relative flex items-center gap-3 rounded-md px-3
        ${first ? "pt-2 pb-2.5" : "py-2.5"}
        ${isDone ? "bg-surface-sunken opacity-60" : "bg-surface-overlay"}
      `.trim()}
    >
      {/* Timeline dot */}
      <div
        className={`
          relative z-10 flex h-[13px] w-[13px] shrink-0 items-center justify-center
          rounded-full border-2
          ${isDone
            ? "border-success bg-success"
            : "border-border-default bg-surface-raised"
          }
        `.trim()}
      >
        {isDone && (
          <svg className="h-[7px] w-[7px] text-text-inverse" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6l3 3 5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {!isDone && <Circle className="h-1.5 w-1.5 text-border-default" aria-hidden />}
      </div>

      {/* Title */}
      <span
        className={`flex-1 text-subheadline ${
          isDone ? "text-text-muted line-through" : "text-text-primary"
        }`}
      >
        {milestone.title}
      </span>

      {/* Target value */}
      {milestone.target_value != null && (
        <span className="font-mono tabular-nums text-caption1 text-text-secondary">
          {milestone.target_value}{unit ? ` ${unit}` : ""}
        </span>
      )}

      {/* Date */}
      {milestone.target_date && (
        <span className="text-caption1 text-text-muted">
          {formatDate(milestone.target_date)}
        </span>
      )}

      {/* Toggle button — hidden for achieved, visible for upcoming */}
      {!isDone && onToggle && (
        <button
          type="button"
          onClick={() => onToggle(milestone.milestone_id)}
          className="text-caption1 font-medium text-accent hover:underline shrink-0"
          aria-label="标记为已完成"
        >
          完成
        </button>
      )}

      {/* Status badge */}
      {isDone && <Badge variant="success"><Check className="h-3 w-3" aria-hidden /></Badge>}
    </li>
  );
}
