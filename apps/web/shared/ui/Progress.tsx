import { type HTMLAttributes } from "react";

interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  size?: "sm" | "md" | "lg";
  barClass?: string;
}

const sizeStyles = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
};

export function Progress({
  value,
  max = 100,
  label,
  showValue = false,
  size = "md",
  barClass,
  className = "",
  ...props
}: ProgressProps) {
  const clampedValue = Math.max(0, Math.min(value, max));
  const percent = max > 0 ? (clampedValue / max) * 100 : 0;

  return (
    <div className={`flex flex-col gap-1 ${className}`.trim()} {...props}>
      {(label || showValue) && (
        <div className="flex items-center justify-between">
          {label && (
            <span className="text-caption1 font-medium text-text-secondary">
              {label}
            </span>
          )}
          {showValue && (
            <span className="text-caption1 font-mono text-text-muted">
              {clampedValue}/{max}
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={max}
        className={`
          w-full overflow-hidden rounded-full
          bg-surface-overlay
          ${sizeStyles[size]}
        `.trim()}
      >
        <div
          className={`
            h-full rounded-full transition-all duration-300 ease-out
            ${barClass ?? "bg-accent"}
          `.trim()}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
