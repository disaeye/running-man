const STROKE = 6;

const TONE_STROKE = {
  accent: "var(--color-accent)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
} as const;

/**
 * 环形进度：目标完成度、周负荷达成率。
 *
 * 环宽固定 6px，轨道用 `--color-surface-active`，填充按 tone 取语义色变量。
 * 环内居中放当前值，环下一行放标签。
 *
 * value 夹在 0 到 max 之间，max 为 0 时按 0 处理：没有目标就没有完成度，
 * 不除零，也不画出一圈满环。
 */
export function RingStat({
  value,
  max,
  label,
  caption,
  size = 96,
  tone = "accent",
}: {
  readonly value: number;
  readonly max: number;
  readonly label: string;
  readonly caption?: string;
  readonly size?: number;
  readonly tone?: "accent" | "success" | "warning";
}) {
  const ceiling = max > 0 ? max : 0;
  const current = ceiling === 0 ? 0 : Math.min(ceiling, Math.max(0, value));
  const ratio = ceiling === 0 ? 0 : current / ceiling;

  const radius = (size - STROKE) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      role="img"
      aria-label={`${label} ${current}/${ceiling}`}
      className="inline-flex flex-col items-center gap-1.5"
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          aria-hidden="true"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--color-surface-active)"
            strokeWidth={STROKE}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={TONE_STROKE[tone]}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-title2 font-semibold tabular-nums text-text-primary">
          {current}
        </span>
      </div>
      <span className="text-caption1 text-text-muted">{label}</span>
      {caption ? <span className="text-caption1 text-text-secondary">{caption}</span> : null}
    </div>
  );
}
