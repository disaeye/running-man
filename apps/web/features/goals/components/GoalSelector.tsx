import type { Goal } from "@shared/types/goals";

/** Goal picker tabs when multiple goals exist */
export function GoalSelector({ goals, selectedId, onSelect }: {
  goals: Goal[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto" data-testid="goal-selector">
      {goals.map((g) => (
        <button
          key={g.goal_id}
          type="button"
          onClick={() => onSelect(g.goal_id)}
          className={`
            focus-ring flex min-h-[44px] shrink-0 items-center rounded-md px-3 py-1.5
            text-subheadline transition-colors duration-150
            ${selectedId === g.goal_id
              ? "bg-accent text-on-accent"
              : "bg-surface-overlay text-text-secondary hover:bg-surface-active hover:text-text-primary"
            }
          `.trim()}
        >
          {g.title}
        </button>
      ))}
    </div>
  );
}
