"use client";

import { Card } from "@shared/ui/Card";
import { SectionHeader } from "@shared/ui/SectionHeader";
import type { AnalysisSummary } from "@features/activity/hooks/useActivityAnalysis";

export interface AerobicDecouplingCardProps {
  summary: AnalysisSummary | null;
  /** When true, show a quiet empty state instead of hiding entirely */
  showEmpty?: boolean;
}

/**
 * Shows aerobic decoupling (%) when analysis could compute it from paired
 * effort + HR streams. Positive = second half cost more HR for same work.
 */
export function AerobicDecouplingCard({
  summary,
  showEmpty = false,
}: AerobicDecouplingCardProps) {
  const pct = summary?.decoupling_pct;
  if (pct == null) {
    if (!showEmpty) return null;
    return (
      <Card padding="md" data-testid="aerobic-decoupling-card-empty">
        <SectionHeader title="有氧解耦" subtitle="样本不足" />
        <div className="mt-4 h-2 rounded-full bg-surface-sunken" aria-hidden />
      </Card>
    );
  }

  const abs = Math.abs(pct);
  const band =
    abs < 5 ? "优秀稳态" : abs < 10 ? "可接受" : abs < 15 ? "偏高" : "显著漂移";
  const tone =
    abs < 5
      ? "text-success"
      : abs < 10
        ? "text-text-primary"
        : abs < 15
          ? "text-warning"
          : "text-error";
  const chip =
    abs < 5
      ? "bg-success/10 text-success"
      : abs < 10
        ? "bg-surface-overlay text-text-secondary"
        : abs < 15
          ? "bg-warning/10 text-warning"
          : "bg-error/10 text-error";

  return (
    <Card padding="md" data-testid="aerobic-decoupling-card">
      <SectionHeader
        title="有氧解耦"
        action={
          <span className={`rounded-full px-2.5 py-1 text-caption1 font-medium ${chip}`}>
            {band}
          </span>
        }
      />
      <p className={`mt-3 font-mono text-display-sm font-semibold tabular-nums ${tone}`}>
        {pct > 0 ? "+" : ""}
        {pct.toFixed(1)}%
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-sunken" data-testid="decoupling-fill">
        <div
          className={`h-full rounded-full ${abs < 5 ? "bg-success" : abs < 10 ? "bg-accent" : abs < 15 ? "bg-warning" : "bg-error"}`}
          style={{ width: `${Math.min(100, Math.abs(pct) * 4)}%` }}
        />
      </div>
          </Card>
  );
}
