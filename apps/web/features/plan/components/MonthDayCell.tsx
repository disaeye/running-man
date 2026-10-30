"use client";


interface MonthDayCellProps {
  day: number;
  iso: string;
  isToday: boolean;
  isRace: boolean;
  isCompleted: boolean;
  hasPlanned: boolean;
  durationMinutes: number;
  onSelect: (iso: string) => void;
}

/**
 * 月历格显示日期、训练时长和完成状态。
 *
 * 状态标记只有两种形态：比赛是 accent 短标签，完成与否是 6px 圆点。
 * 同一格既有比赛又有完成时比赛优先 —— 一个格子不叠第三种记号。
 *
 * 高度固定 `min-h-16`，不随有没有负荷、有没有比赛跳动。
 */
export function MonthDayCell({
  day,
  iso,
  isToday,
  isRace,
  isCompleted,
  hasPlanned,
  durationMinutes,
  onSelect,
}: MonthDayCellProps) {
  const pending = hasPlanned && !isCompleted;

  return (
    <button
      type="button"
      onClick={() => onSelect(iso)}
      data-testid={`plan-month-day-${iso}`}
      data-today={isToday ? "true" : undefined}
      data-compliance={isCompleted ? "done" : undefined}
      aria-label={[
        `${day}日`,
        durationMinutes > 0 ? `训练 ${durationMinutes} 分钟` : "",
        isRace ? "比赛日" : "",
        isCompleted ? "已完成" : hasPlanned ? "已计划" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      className={`focus-ring flex min-h-16 flex-col justify-between gap-1 rounded-lg border p-1 text-left transition-colors hover:bg-surface-overlay ${
        isToday ? "border-calendar-today ring-1 ring-calendar-today" : "border-border-default"
      }`}
    >
      {/* 1024 下格子只有 54px，日号与「比赛」都必须不换行、不收缩，否则行高会跳。 */}
      <span className="flex items-start justify-between gap-1">
        <span
          className={`shrink-0 font-mono text-caption1 tabular-nums ${
            isToday ? "font-semibold text-calendar-today" : "text-text-secondary"
          }`}
        >
          {day}
        </span>
        {isRace ? (
          <span className="shrink-0 text-caption1 leading-none font-semibold whitespace-nowrap text-accent-strong">比赛</span>
        ) : isCompleted ? (
          <span className="mt-1 size-1.5 rounded-full bg-success" aria-hidden />
        ) : pending ? (
          <span className="mt-1 size-1.5 rounded-full bg-text-muted" aria-hidden />
        ) : null}
      </span>

      {durationMinutes > 0 ? (
        <span className="self-end font-mono text-caption1 tabular-nums text-text-secondary">
          {durationMinutes} 分
        </span>
      ) : null}
    </button>
  );
}
