"use client";

import Link from "next/link";
import { PageCard } from "@shared/ui/Card";
import { Tag } from "@shared/ui/Badge";
import { MetricInlineDisclosure } from "@shared/ui/MetricInlineDisclosure";
import { TextLink } from "@shared/ui/TextLink";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatPaceFromSeconds } from "@shared/lib/format";
import { useActivePlan } from "@features/goals/hooks/useActivePlan";
import { useZoneOverrides } from "@features/settings/hooks/useZoneOverrides";
import { PaceZoneList } from "@features/settings/components/PaceZoneList";

const PACE_STYLE: Record<string, { bar: string; cue: string; pct: string }> = {
  easy: { bar: "bg-zone-1", cue: "有氧基础", pct: "59–69% VO₂max" },
  marathon: { bar: "bg-zone-2", cue: "赛事稳态", pct: "76–80% VO₂max" },
  threshold: { bar: "bg-zone-3", cue: "乳酸巡航", pct: "83–88% VO₂max" },
  interval: { bar: "bg-zone-4", cue: "最大摄氧", pct: "95–98% VO₂max" },
  repetition: { bar: "bg-zone-5", cue: "速度刺激", pct: "105–110% VO₂max" },
};

/** 跑力与训练配速卡：VDOT 标定加五个 Daniels 配速区间，数据来自 /plan/active。 */
export function TrainingPaceCard({ goalId }: { goalId: string }) {
  const { data: plan, loading, error, reload } = useActivePlan(goalId);
  const { zones } = useZoneOverrides();

  if (loading) {
    return <PageCard title="跑力与训练配速"><p className="text-sm text-muted-foreground">正在读取配速…</p></PageCard>;
  }
  if (error) {
    return (
      <PageCard title="跑力与训练配速">
        <p role="alert" className="text-sm text-destructive">{error}</p>
        <button type="button" onClick={reload} className="mt-2 inline-flex min-h-11 items-center text-caption1 text-accent-strong hover:underline">重试</button>
      </PageCard>
    );
  }
  const paces = plan?.training_paces ?? [];
  const fallbackPaceZones = zones?.pace_zones ?? [];
  if (paces.length === 0) {
    if (fallbackPaceZones.length > 0) {
      return (
        <PageCard
          title="训练配速参考"
          action={<Tag tone="outline">按个人阈值配速</Tag>}
        >
          <PaceZoneList paceZones={fallbackPaceZones} thresholdPace={zones?.threshold_pace ?? null} />
        </PageCard>
      );
    }
    return (
      <PageCard title="跑力与训练配速">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">还没有可用的配速区间：目标里未填比赛成绩，且尚未标定阈值配速。</p>
          <Link
            href="/settings?section=training"
            className="tactile inline-flex min-h-11 items-center rounded-full border border-border-default px-3.5 text-caption1 font-medium text-accent-strong hover:bg-secondary"
          >
            去设置阈值配速
          </Link>
        </div>
      </PageCard>
    );
  }

  return (
    <PageCard
      title="跑力与训练配速"
      action={plan?.vdot != null ? <Tag tone="primary">VDOT {plan.vdot.toFixed(1)}</Tag> : undefined}
    >
      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-5 sm:gap-2">
        {paces.map((pace) => {
          const style = PACE_STYLE[pace.key] ?? { bar: "bg-zone-1", cue: "", pct: "" };
          return (
            <div
              key={pace.key}
              className="flex items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface-overlay/55 px-3 py-2.5 sm:flex-col sm:items-center sm:justify-between sm:gap-1.5 sm:px-2 sm:py-3"
            >
              <div className="flex items-center gap-2 sm:w-full sm:flex-1 sm:flex-col sm:gap-1">
                <span aria-hidden="true" className={`h-5 w-1 shrink-0 rounded-full sm:h-1 sm:w-full ${style.bar}`} />
                <span className="text-center text-caption1 font-semibold text-text-primary">{pace.label}</span>
                {style.cue ? (
                  <span className="text-center text-caption1 text-text-muted">{style.cue}</span>
                ) : null}
                {style.pct ? (
                  <span className="hidden text-center font-mono text-caption2 tabular-nums text-text-muted sm:inline">
                    {style.pct}
                  </span>
                ) : null}
              </div>
              <span className="flex shrink-0 items-baseline gap-1 font-mono tabular-nums sm:flex-col sm:items-center sm:gap-0">
                <span className="num text-subheadline font-semibold tabular-nums text-text-primary">
                  {formatPaceFromSeconds(pace.min_s_per_km)}
                </span>
                <span className="num text-caption1 tabular-nums text-text-muted">
                  <span aria-hidden>– </span>
                  {formatPaceFromSeconds(pace.max_s_per_km)}/km
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption1 text-text-muted">
        <span>
          {zones?.threshold_pace != null
            ? `按阈值配速 ${formatPaceFromSeconds(zones.threshold_pace)}/km 计算`
            : "按目标比赛成绩推算"}
          {plan?.vdot == null ? ` · VDOT ${NO_VALUE}` : ""}
        </span>
        <MetricInlineDisclosure
          label="课表靶配速"
          explanation={{
            summary: "Daniels 离散课表靶配速：各档按 %VO₂max 锚定。",
            note: "各档之间留白，避免落入低收益的过渡区间；它与「我的」页按阈值配速连续划分的 Z1–Z5 配速分区是两套口径。",
          }}
        />
      </div>
      <div className="mt-1 flex flex-wrap gap-3">
        <TextLink href="/profile" arrow>查看连续配速分区</TextLink>
        <TextLink href="/settings?section=training" arrow>{zones?.threshold_pace != null ? "调整阈值" : "设置阈值"}</TextLink>
      </div>
    </PageCard>
  );
}
