type ProgressRowTone = "accent" | "success" | "warning";

interface ProgressRowProps {
  label: string;
  value: number;
  detail?: string;
  tone?: ProgressRowTone;
}

const TONE_FILL: Record<ProgressRowTone, string> = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
};

/**
 * 标签加细进度条。值超界一律夹到 0–100，条形宽度和右端百分比读同一个数，
 * 所以不会出现「写着 120% 但条已经到底」的两种真相。
 *
 * 条只有 6px 高：这是一个读数行，不是可拖动的控件，拇指按不到也不需要按到。
 */
export function ProgressRow({
  label,
  value,
  detail,
  tone = "accent",
}: ProgressRowProps) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-caption1 text-text-secondary">
          {label}
        </span>
        <span className="shrink-0 font-mono text-caption1 text-text-secondary">
          {percent}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-active"
      >
        <div
          className={`h-full rounded-full ${TONE_FILL[tone]}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {detail && (
        <p className="mt-1 text-caption1 text-text-muted">{detail}</p>
      )}
    </div>
  );
}
