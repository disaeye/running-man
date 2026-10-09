import { Input } from "@shared/ui/input";

const WEEKDAYS = [
  { value: 0, label: "一" },
  { value: 1, label: "二" },
  { value: 2, label: "三" },
  { value: 3, label: "四" },
  { value: 4, label: "五" },
  { value: 5, label: "六" },
  { value: 6, label: "日" },
] as const;

interface Props {
  restDays: number;
  preferredDaysOff: number[];
  weeklyTss: string;
  onRestDaysChange: (value: number) => void;
  onToggleDayOff: (value: number) => void;
  onWeeklyTssChange: (value: string) => void;
}

export function PlanGenerationSettings({
  restDays,
  preferredDaysOff,
  weeklyTss,
  onRestDaysChange,
  onToggleDayOff,
  onWeeklyTssChange,
}: Props) {
  return (
    <section className="flex flex-col gap-3" aria-label="训练安排设置">
      <label className="flex items-center justify-between gap-3">
        <span className="text-subheadline text-text-secondary">每周休息日</span>
        <select
          aria-label="每周休息日"
          value={restDays}
          onChange={(event) => onRestDaysChange(Number(event.target.value))}
          className="min-h-10 rounded-lg border border-border-default bg-surface-card px-3 text-subheadline text-text-primary"
        >
          {[0, 1, 2, 3, 4, 5, 6].map((count) => (
            <option key={count} value={count}>{count} 天</option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2" aria-label="偏好休息日">
        {WEEKDAYS.map((day) => (
          <button
            key={day.value}
            type="button"
            aria-pressed={preferredDaysOff.includes(day.value)}
            onClick={() => onToggleDayOff(day.value)}
            className={`min-h-10 rounded-full border px-3 text-caption1 transition-colors ${
              preferredDaysOff.includes(day.value)
                ? "border-accent bg-accent/15 text-accent-strong"
                : "border-border-default bg-surface-card text-text-secondary"
            }`}
          >
            {day.label}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-3">
        <span className="text-subheadline text-text-secondary">每周目标 TSS（可选）</span>
        <Input
          aria-label="每周目标 TSS"
          type="number"
          min={1}
          max={2000}
          value={weeklyTss}
          onChange={(event) => onWeeklyTssChange(event.target.value)}
          className="max-w-32"
          placeholder="依据近期负荷"
        />
      </label>
    </section>
  );
}
