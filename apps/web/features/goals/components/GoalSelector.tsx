"use client";

import { Tag } from "@shared/ui/Lovable";
import type { Goal } from "@shared/types/goals";

/** 目标切换条：横向标签，按传入顺序（页面已排序：主目标优先）。 */
export function GoalSelector({ goals, selectedId, onSelect }: {
  goals: Goal[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" data-testid="goal-selector">
      {goals.map((goal) => (
        <button
          key={goal.goal_id}
          type="button"
          onClick={() => onSelect(goal.goal_id)}
          className={`
            focus-ring flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5
            text-subheadline transition-colors duration-150
            ${selectedId === goal.goal_id
              ? "border-accent bg-accent/15 text-accent-strong"
              : "border-border-default bg-surface-card text-text-secondary hover:bg-secondary hover:text-text-primary"
            }
          `.trim()}
        >
          <span className="max-w-40 truncate">{goal.title}</span>
          {goal.is_primary ? <Tag tone="primary">主</Tag> : null}
          {goal.status !== "active" ? <Tag tone="muted">{goal.status === "achieved" ? "已达成" : "已放弃"}</Tag> : null}
        </button>
      ))}
    </div>
  );
}
