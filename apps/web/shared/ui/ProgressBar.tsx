export interface ProgressBarProps {
  /** 0–100。超出范围的值被夹住。 */
  readonly percent: number;
  /** 进度条的颜色，默认主色。 */
  readonly tone?: "accent" | "tertiary" | "secondary" | "muted";
  /** 无障碍标签：进度代表什么。 */
  readonly label: string;
  readonly className?: string;
  /** 轨道高度，默认 6px。 */
  readonly thickness?: "thin" | "regular";
}

const TONE_FILL: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  accent: "bg-accent",
  tertiary: "bg-tertiary",
  secondary: "bg-secondary",
  muted: "bg-text-muted",
};

/**
 * 细进度条。
 *
 * 进度是「完成度」，所以条宽和读数必须是同一个数：读数说 63%，条就是 63%。
 * 轨道用 `--color-surface-active`，在深色画布上比卡片亮一档，填充压在轨道上。
 */
export function ProgressBar({
  percent,
  tone = "accent",
  label,
  className = "",
  thickness = "regular",
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const height = thickness === "thin" ? "h-1" : "h-1.5";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`w-full overflow-hidden rounded-full bg-surface-active ${height} ${className}`.trim()}
    >
      <div
        className={`h-full rounded-full ${TONE_FILL[tone]}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
