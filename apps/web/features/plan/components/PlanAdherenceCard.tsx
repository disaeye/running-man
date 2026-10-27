"use client";

import { useCoachContext } from "@features/today/hooks/useCoachContext";

/**
 * Surfaces 7-day plan adherence on the calendar/plan tab so users see
 * completed vs planned load without opening the coach-context expander.
 */
export function PlanAdherenceCard() {
  const { data, loading, error } = useCoachContext();

  if (loading) {
    return (
      <p className="text-caption1 text-text-muted" data-testid="plan-adherence-card">
        执行率加载中…
      </p>
    );
  }

  if (error || !data) {
    return (
      <p className="text-caption1 text-text-muted" data-testid="plan-adherence-card">
        暂无法加载计划执行数据
      </p>
    );
  }

  const { plan_adherence: a } = data;
  const hasPlan = a.planned_tss_7d > 0;
  const pct = Math.round(a.adherence_pct);
  const status =
    !hasPlan ? "无计划" : pct >= 110 ? "偏多" : pct >= 80 ? "正常" : "偏少";
  const chip =
    !hasPlan
      ? "bg-surface-overlay text-text-muted"
      : pct >= 110
        ? "bg-warning/10 text-warning"
        : pct >= 80
          ? "bg-success/10 text-success"
          : "bg-error/10 text-error";

  return (
    <div data-testid="plan-adherence-card">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-display-sm font-semibold tabular-nums text-text-primary">
          {hasPlan ? `${pct}%` : "--"}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-caption1 font-medium ${chip}`}>
          {status}
        </span>
      </div>
      <p className="mt-1 text-footnote text-text-secondary">
        完成 {Math.round(a.completed_tss_7d)} / 计划 {Math.round(a.planned_tss_7d)} TSS
      </p>
      {hasPlan && (
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={Math.min(pct, 150)}
          aria-valuemin={0}
          aria-valuemax={150}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${Math.min(pct, 150) / 1.5}%` }}
          />
        </div>
      )}
    </div>
  );
}
