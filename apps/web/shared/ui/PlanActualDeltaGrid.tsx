import type { ReactNode } from "react";
import { Badge } from "@shared/ui/Badge";
import { InsetBlock } from "@shared/ui/InsetBlock";

export interface PlanActualDeltaBadge {
  readonly label: string;
  readonly tone: "success" | "warn" | "neutral";
}

export interface PlanActualRowItem {
  readonly key: string;
  readonly label: string;
  readonly planned: string | null;
  readonly actual: string | null;
  readonly delta?: PlanActualDeltaBadge | null;
  readonly missingNote?: string;
}

interface PlanActualDeltaGridProps {
  readonly rows: readonly PlanActualRowItem[];
  readonly summaryBadges?: readonly PlanActualDeltaBadge[];
  readonly footnote?: ReactNode;
  readonly testId?: string;
}

function deltaVariant(tone: PlanActualDeltaBadge["tone"]): "success" | "warning" | "neutral" {
  return tone === "success" ? "success" : tone === "warn" ? "warning" : "neutral";
}

/**
 * 计划与实际四列对齐对照矩阵：指标名 · 计划目标 · 实际完成 · 偏差 Δ 徽章。
 */
export function PlanActualDeltaGrid({
  rows,
  summaryBadges,
  footnote,
  testId,
}: PlanActualDeltaGridProps) {
  return (
    <InsetBlock data-testid={testId}>
      {summaryBadges && summaryBadges.length > 0 ? (
        <div
          className="mb-3 flex flex-wrap gap-1.5 border-b border-border-subtle pb-2.5"
          data-testid="day-plan-actual-deltas"
        >
          {summaryBadges.map((delta) => (
            <Badge key={delta.label} variant={deltaVariant(delta.tone)}>
              {delta.label}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="hidden grid-cols-[5.25rem_minmax(0,1fr)_minmax(0,1fr)_minmax(5.5rem,auto)] gap-x-3 pb-1.5 text-caption1 font-semibold text-text-secondary sm:grid">
        <span>指标</span>
        <span>计划课表</span>
        <span>实际完成</span>
        <span className="text-right">偏差</span>
      </div>
      <div className="grid grid-cols-[4.25rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 pb-1.5 text-caption1 font-semibold text-text-secondary sm:hidden">
        <span>指标</span>
        <span>计划课表</span>
        <span>实际完成</span>
      </div>

      <div className="divide-y divide-border-subtle">
        {rows.map((row) => (
          <div key={row.key} className="py-2.5 last:pb-0">
            <div className="grid grid-cols-[4.25rem_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-x-2 sm:grid-cols-[5.25rem_minmax(0,1fr)_minmax(0,1fr)_minmax(5.5rem,auto)] sm:gap-x-3">
              <span className="min-w-0 text-caption1 font-medium text-text-muted">{row.label}</span>
              <span
                className={`min-w-0 font-mono text-subheadline tabular-nums ${
                  row.planned == null ? "text-text-muted" : "text-text-primary"
                }`}
              >
                {row.planned ?? "未记录"}
              </span>
              <span
                className={`min-w-0 font-mono text-subheadline tabular-nums ${
                  row.actual == null ? "text-text-muted" : "text-text-primary"
                }`}
              >
                {row.actual ?? "未记录"}
              </span>
              {row.delta ? (
                <div className="col-span-3 mt-1.5 flex justify-start sm:col-span-1 sm:mt-0 sm:justify-end">
                  <Badge variant={deltaVariant(row.delta.tone)}>{row.delta.label}</Badge>
                </div>
              ) : (
                <span className="hidden sm:block" />
              )}
            </div>
            {row.missingNote && row.actual == null ? (
              <p className="mt-1 text-caption1 text-text-muted">{row.missingNote}</p>
            ) : null}
          </div>
        ))}
      </div>

      {footnote ? (
        <p className="mt-3 text-caption1 text-text-muted" data-testid="day-plan-actual-others">
          {footnote}
        </p>
      ) : null}
    </InsetBlock>
  );
}
