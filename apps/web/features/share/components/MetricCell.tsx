import type { ReactNode } from "react";

export function MetricCell({
  icon,
  label,
  value,
}: {
  readonly icon?: ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface-overlay px-3 py-2">
      <span className="flex items-center gap-1.5 text-caption1 text-text-muted">
        {icon}
        {label}
      </span>
      <span
        className="text-headline font-semibold tabular-nums text-text-primary"
        data-testid="share-metric-value"
      >
        {value}
      </span>
    </div>
  );
}
