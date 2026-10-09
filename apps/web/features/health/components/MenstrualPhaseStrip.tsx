"use client";

import { useMemo } from "react";
import { EmptyState } from "@shared/ui/EmptyState";
import { EMPTY_LABEL } from "@shared/lib/use-data-state";
import type { WellnessPoint } from "@features/health/hooks/useWellness";

interface MenstrualPhaseStripProps {
  data: WellnessPoint[];
}

/**
 * 生理周期阶段条：显示最近 90 天的阶段编号。
 * Intervals.icu 以整数编号返回阶段，本系统不映射名称，仅按编号展示。
 */
export function MenstrualPhaseStrip({ data }: MenstrualPhaseStripProps) {
  const points = useMemo(
    () =>
      [...data]
        .sort((a, b) => a.day.localeCompare(b.day))
        .filter((p) => p.menstrual_phase != null)
        .slice(-90),
    [data],
  );

  const latest = points[points.length - 1];
  if (points.length === 0 || latest == null) {
    return (
      <div className="py-6">
        <EmptyState title={EMPTY_LABEL} description="Intervals.icu 返回生理周期数据后，这里将展示阶段编号" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-subheadline font-semibold uppercase tracking-wider text-text-muted">
          生理周期阶段
        </h3>
        <span className="text-caption1 text-text-muted">
          最新 {latest.day.slice(5)} · 阶段 {latest.menstrual_phase}
          {latest.menstrual_phase_predicted != null &&
            `（预测 ${latest.menstrual_phase_predicted}）`}
        </span>
      </div>
      <ol className="flex h-8 w-full overflow-hidden rounded-md border border-border-subtle" data-testid="menstrual-phase-strip">
        {points.map((point) => {
          const phase = point.menstrual_phase ?? 0;
          const changed = point.menstrual_phase !== previousPhase(points, point.day);
          return (
            <li
              key={point.day}
              title={`${point.day} · 阶段 ${point.menstrual_phase}`}
              className={`h-full flex-1 ${changed ? "border-l border-border-subtle" : ""}`}
              style={{ backgroundColor: phaseColor(phase), opacity: 0.35 + phase * 0.15 }}
            />
          );
        })}
      </ol>
      <p className="mt-2 text-caption1 text-text-muted">
        颜色按 Intervals.icu 阶段编号区分；阶段编号含义以 Intervals.icu 为准。
      </p>
    </div>
  );
}

function previousPhase(points: WellnessPoint[], day: string): number | null {
  const index = points.findIndex((p) => p.day === day);
  if (index <= 0) return null;
  return points[index - 1]?.menstrual_phase ?? null;
}

/** 按编号取低饱和的阶段底色（主题表层色阶，不使用原始色值）。 */
function phaseColor(phase: number): string {
  switch (phase) {
    case 0:
      return "var(--color-surface-raised)";
    case 1:
      return "var(--color-sport-run)";
    case 2:
      return "var(--color-sport-ride)";
    case 3:
      return "var(--color-sport-swim)";
    case 4:
      return "var(--color-sport-hike)";
    default:
      return "var(--color-data-emphasis)";
  }
}
