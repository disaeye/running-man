"use client";

import { Card } from "@shared/ui/Card";
import { Badge } from "@shared/ui/Badge";
import { ScoreRing } from "@shared/ui/ScoreRing";
import { usePlanQuality } from "@features/plan/hooks/usePlanQuality";

type Grade = "A" | "B" | "C" | "D" | "F";

type GradeVariant = "success" | "warning" | "error" | "neutral";

interface GradeStyling {
  /** SVG stroke / inline color for ScoreRing — semantic token reference, no raw hex. */
  ringColor: string;
  badgeVariant: GradeVariant;
  label: string;
}

const GRADE_STYLING: Record<Grade, GradeStyling> = {
  A: { ringColor: "var(--color-success)", badgeVariant: "success", label: "优秀" },
  B: { ringColor: "var(--color-warning)", badgeVariant: "warning", label: "良好" },
  C: { ringColor: "var(--color-error)", badgeVariant: "error", label: "一般" },
  D: { ringColor: "var(--color-recovery-moderate)", badgeVariant: "neutral", label: "需改进" },
  F: { ringColor: "var(--color-error)", badgeVariant: "error", label: "不理想" },
};

const DEFAULT_RING_COLOR = "var(--color-text-muted)";

function gradeStyling(grade: Grade | null): { ringColor: string; badgeVariant: GradeVariant; label: string } {
  if (grade && grade in GRADE_STYLING) return GRADE_STYLING[grade];
  return { ringColor: DEFAULT_RING_COLOR, badgeVariant: "neutral", label: "" };
}

interface PlanQualityProps {
  readonly from?: string;
  readonly to?: string;
}

export function PlanQuality({ from, to }: PlanQualityProps) {
  const range = from && to ? { from, to } : undefined;
  const { data, loading, error } = usePlanQuality(range);

  if (loading) {
    return (
      <Card padding="md" data-testid="plan-quality-loading">
        <div className="flex h-40 items-center justify-center text-subheadline text-text-muted">正在评估训练计划…</div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card padding="md" data-testid="plan-quality-empty">
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
          <span className="text-subheadline font-medium text-text-secondary">训练计划评分</span>
          <span className="text-caption1 text-text-muted">
            {error ? "评分服务暂不可用" : "暂无评分数据，请先制定训练计划"}
          </span>
        </div>
      </Card>
    );
  }

  const { ringColor, badgeVariant, label } = gradeStyling(data.grade);

  return (
    <Card padding="md" data-testid="plan-quality-card">
      <div className="flex items-start gap-4">
        <ScoreRing value={data.score} max={100} size={72} color={ringColor} ariaLabel={`计划评分 ${data.score}`}>
          <span className="text-title3 font-bold" style={{ color: ringColor }}>
            {data.grade ?? "-"}
          </span>
        </ScoreRing>

        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-subheadline font-semibold text-text-primary">计划评分: {label}</h3>
            {data.grade && <Badge variant={badgeVariant}>{data.grade}</Badge>}
          </div>

          <p className="text-caption1 text-text-secondary">{data.message}</p>

          <div className="grid grid-cols-3 gap-2 rounded-lg border border-border-default bg-surface-card p-3 text-center max-sm:grid-cols-1">
            <div>
              <p className="text-caption1 text-text-muted">本周 TSS</p>
              <p className="text-subheadline font-bold tabular-nums text-text-primary">
                {Math.round(data.weekly_tss)}
                <span className="text-caption2 text-text-muted">/{Math.round(data.target_tss)}</span>
              </p>
            </div>
            <div>
              <p className="text-caption1 text-text-muted">关键训练</p>
              <p className="text-subheadline font-bold tabular-nums text-text-primary">
                {data.key_sessions_completed}/{data.key_sessions_total}
              </p>
            </div>
            <div>
              <p className="text-caption1 text-text-muted">评分</p>
              <p className="text-subheadline font-bold tabular-nums" style={{ color: ringColor }}>{data.score}</p>
            </div>
          </div>

          {data.concerns.length > 0 && (
            <div className="mt-1 flex flex-col gap-1">
              <span className="text-caption1 font-medium text-text-muted">关注点</span>
              <ul className="flex flex-col gap-1">
                {data.concerns.slice(0, 3).map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-caption1 text-text-secondary">
                    <span className="mt-1 inline-flex size-1 shrink-0 rounded-full bg-warning" aria-hidden />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
