"use client";

import { Card } from "@shared/ui/Card";
import { SectionHeader } from "@shared/ui/SectionHeader";
import { useCoachContext } from "@features/today/hooks/useCoachContext";

/**
 * Surfaces 7-day plan adherence on the calendar/plan tab so users see
 * completed vs planned load without opening the coach-context expander.
 */
export function PlanAdherenceCard() {
  const { data, loading, error } = useCoachContext();

  if (loading) {
    return (
      <Card padding="md" data-testid="plan-adherence-card">
        <SectionHeader title="近 7 日执行" subtitle="执行率加载中…" />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card padding="md" data-testid="plan-adherence-card">
        <SectionHeader title="近 7 日执行" subtitle="暂无法加载计划执行数据" />
      </Card>
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
    <Card padding="md" data-testid="plan-adherence-card">
      <SectionHeader
        title="近 7 日执行"
        action={
          <span className={`rounded-full px-2.5 py-1 text-caption1 font-medium ${chip}`}>
            {status}
          </span>
        }
      />
      <p className="mt-3 font-mono text-display-sm font-semibold tabular-nums text-text-primary">
        {hasPlan ? `${pct}%` : "--"}
      </p>
      <p className="mt-1 text-footnote text-text-secondary">
        完成 {Math.round(a.completed_tss_7d)} / 计划 {Math.round(a.planned_tss_7d)}{" "}
        TSS
      </p>
      {hasPlan && (
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-surface-sunken"
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
    </Card>
  );
}
