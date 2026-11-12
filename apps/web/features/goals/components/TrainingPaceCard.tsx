"use client";

import { PageCard, Tag } from "@shared/ui/Lovable";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatPaceFromSeconds } from "@shared/lib/format";
import { useActivePlan } from "@features/goals/hooks/useActivePlan";

/** 跑力与训练配速卡：VDOT 标定加五个 Daniels 配速区间，数据来自 /plan/active。 */
export function TrainingPaceCard({ goalId }: { goalId: string }) {
  const { data: plan, loading, error, reload } = useActivePlan(goalId);

  if (loading) {
    return <PageCard title="跑力与训练配速"><p className="text-sm text-muted-foreground">正在读取配速…</p></PageCard>;
  }
  if (error) {
    return (
      <PageCard title="跑力与训练配速">
        <p role="alert" className="text-sm text-destructive">{error}</p>
        <button type="button" onClick={reload} className="mt-2 text-caption1 text-accent-strong hover:underline">重试</button>
      </PageCard>
    );
  }
  const paces = plan?.training_paces ?? [];
  if (paces.length === 0) {
    return (
      <PageCard title="跑力与训练配速">
        <p className="text-sm text-muted-foreground">还没有可用的配速区间：目标里没有比赛成绩，阈值配速也还没确定。</p>
      </PageCard>
    );
  }

  return (
    <PageCard
      title="跑力与训练配速"
      action={plan?.vdot != null ? <Tag tone="primary">VDOT {plan.vdot.toFixed(1)}</Tag> : undefined}
    >
      <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-5 sm:gap-2">
        {paces.map((pace) => (
          <div
            key={pace.key}
            className="flex items-baseline justify-between gap-2 rounded-lg bg-surface-overlay/50 px-3 py-2 sm:flex-col sm:items-center sm:justify-between sm:gap-1 sm:px-1 sm:py-2.5"
          >
            <span className="text-caption1 font-medium text-text-secondary">{pace.label}</span>
            <span className="flex items-baseline gap-1 sm:flex-col sm:items-center sm:gap-0">
              <span className="num text-subheadline font-semibold text-text-primary">
                {formatPaceFromSeconds(pace.min_s_per_km)}
              </span>
              <span aria-hidden className="text-caption1 text-text-muted sm:hidden">–</span>
              <span className="num text-caption1 text-text-muted">
                {formatPaceFromSeconds(pace.max_s_per_km)}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-caption1 text-muted-foreground">
        配速区间由当前 VDOT 经 Daniels 氧气成本曲线算出，与课表生成器同源。{plan?.vdot == null ? ` VDOT ${NO_VALUE}` : ""}
      </p>
    </PageCard>
  );
}
