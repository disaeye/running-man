/**
 * Compact weekly summary chip — Intervals.icu-style one-liner that rolls up
 * session completion, planned vs actual TSS, and a TSS delta when both sides
 * exist. Backwards compatible: callers that only pass `completed`/`total`
 * still get `本周: N/M`. The optional TSS fields extend the strip without
 * changing the existing label.
 */
interface WeekSummaryChipProps {
  completed: number;
  total: number;
  /** Planned TSS for the week (sum of predicted_tss across planned events). */
  plannedTss?: number;
  /** Actual TSS for the week (sum of tss across logged activities). */
  actualTss?: number;
}

function rampToneClass(delta: number): string {
  if (delta >= 0) return "text-success";
  if (delta <= -30) return "text-error";
  return "text-warning";
}

export function WeekSummaryChip({
  completed,
  total,
  plannedTss,
  actualTss,
}: WeekSummaryChipProps) {
  if (total === 0) return null;

  const ratio = completed / total;
  const variantClass =
    ratio >= 0.8
      ? "bg-success/15 text-success border-success/30"
      : ratio >= 0.5
        ? "bg-warning/15 text-warning border-warning/30"
        : "bg-error/15 text-error border-error/30";

  const hasPlanned = plannedTss != null && plannedTss > 0;
  const hasActual = actualTss != null && actualTss > 0;
  const showDelta = hasPlanned && hasActual;
  const delta = showDelta ? Math.round((actualTss ?? 0) - (plannedTss ?? 0)) : 0;
  const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-caption1 font-medium tabular-nums ${variantClass}`}
      aria-label={`本周计划完成度: ${completed}/${total}${hasPlanned ? ` · 计划 ${Math.round(plannedTss!)} TSS` : ""}${hasActual ? ` · 实际 ${Math.round(actualTss!)} TSS` : ""}${showDelta ? ` · 偏差 ${deltaLabel} TSS` : ""}`}
    >
      <span>本周: {completed}/{total}</span>
      {hasPlanned && (
        <span className="inline-flex items-center gap-1 border-l border-current/30 ps-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          {Math.round(plannedTss!)}
        </span>
      )}
      {hasActual && (
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
          {Math.round(actualTss!)}
        </span>
      )}
      {showDelta && (
        <span className={`border-l border-current/30 ps-2 ${rampToneClass(delta)}`}>
          {deltaLabel}
        </span>
      )}
    </span>
  );
}
