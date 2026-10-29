"use client";

import { Card } from "@shared/ui/Card";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { UserProfile } from "@shared/lib/auth";

/**
 * 跑者个人名片（参考稿的档案页头部）。
 *
 * 身份一行：名字、等级徽章、VDOT、PB 摘要。
 * 下面两格：累计总里程、完赛次数。
 *
 * 累计里程是活动记录的总和，完赛次数是录入的比赛成绩条数——两个数都有
 * 明确的来源，不混在一起。
 */

interface Props {
  readonly profile: UserProfile | null;
  /** 全期累计里程（米）。 */
  readonly lifetimeDistanceM: number | null;
  /** 完赛次数。 */
  readonly raceCount: number | null;
  /** VDOT。 */
  readonly vdot: number | null;
  /** 等级徽章文案；没有成绩时是 null。 */
  readonly tierLabel: string | null;
  /** 最好成绩的摘要，例如「全马 3:24:15」。 */
  readonly bestSummary: string | null;
  readonly testId?: string;
}

export function DemoIdentityCard({
  profile,
  lifetimeDistanceM,
  raceCount,
  vdot,
  tierLabel,
  bestSummary,
  testId,
}: Props) {
  const name = profile?.name?.trim() || "未设置姓名";
  const lifetimeKm =
    lifetimeDistanceM != null ? lifetimeDistanceM / 1000 : null;

  return (
    <Card
      data-testid={testId ?? "demo-identity-card"}
      className="relative"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
      >
        <span className="absolute -right-8 -top-8 size-44 rounded-full bg-accent/5 blur-2xl" />
      </div>

      <div className="relative flex items-center gap-4">
        <span
          aria-hidden="true"
          className="grid size-16 shrink-0 place-items-center rounded-full bg-surface-raised font-display text-title2 text-accent"
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              data-page-title
              className="font-display text-title2 uppercase tracking-wide text-text-primary"
            >
              {name}
            </h1>
            {tierLabel ? (
              <span className="rounded bg-accent/15 px-2 py-0.5 font-mono text-caption1 text-accent">
                {tierLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-caption1 text-text-muted">
            {bestSummary ? `${bestSummary} · ` : ""}
            {vdot != null ? `VDOT ${vdot.toFixed(1)}` : `VDOT ${NO_VALUE}`}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-surface-overlay px-2 py-0.5 font-mono text-caption1 text-text-secondary">
              {profile?.preferred_sport ?? "跑步"}
            </span>
            <span className="rounded bg-surface-overlay px-2 py-0.5 font-mono text-caption1 text-text-secondary">
              每周 {profile?.weekly_training_days ?? NO_VALUE} 练
            </span>
          </div>
        </div>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-3 pt-1">
        <Stat
          label="累计总里程"
          value={lifetimeKm != null ? Math.round(lifetimeKm).toLocaleString() : NO_VALUE}
          unit={lifetimeKm != null ? "KM" : null}
        />
        <Stat
          label="完赛次数"
          value={raceCount != null ? String(raceCount) : NO_VALUE}
          unit={raceCount != null ? "次" : null}
        />
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  readonly label: string;
  readonly value: string;
  readonly unit: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-overlay px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-caption1 uppercase tracking-wider text-text-muted">
          {label}
        </p>
        <p className="mt-0.5 flex items-baseline gap-1">
          <span className="font-mono text-title2 font-bold tabular-nums text-text-primary">
            {value}
          </span>
          {unit ? (
            <span className="text-caption1 text-text-muted">{unit}</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
