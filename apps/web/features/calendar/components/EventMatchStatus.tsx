import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import type { MatchStatus } from "../lib/match";

const STATUS_CONFIG: Record<MatchStatus, { icon: typeof CheckCircle2; label: string; colorClass: string }> = {
  completed: { icon: CheckCircle2, label: "已完成", colorClass: "text-success" },
  partial: { icon: MinusCircle, label: "部分完成", colorClass: "text-warning" },
  missed: { icon: XCircle, label: "未完成", colorClass: "text-error" },
};

/** Shows a green/yellow/red match indicator for a planned event. */
export function EventMatchStatus({ status }: { status: MatchStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-0.5 align-middle ${config.colorClass}`}
      aria-label={config.label}
      title={config.label}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

/** "Intervals" label source badge for synced events. */
export function SourceBadge({ source }: { source: "intervals"  | string }) {
  return (
    <span
      className="inline-flex items-center rounded border border-border-subtle bg-surface-overlay px-1.5 py-px text-caption2 font-medium text-text-secondary"
      aria-label="来源"
    >
      {source === "intervals" ? "Intervals" : source}
    </span>
  );
}
