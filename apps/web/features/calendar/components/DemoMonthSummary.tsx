"use client";

import { Card } from "@shared/ui/Card";
import { ProgressBar } from "@shared/ui/ProgressBar";
import { NO_VALUE } from "@shared/lib/use-data-state";

/**
 * 月度遥测三格摘要（参考稿的月度摘要条）。
 *
 * 三格分别是：月度跑量（实际 / 计划）、训练课次（已完成 / 计划）、
 * 累计爬升。每格一条进度条，条宽就是那个百分比。
 *
 * 目标跑量来自课表里每一节训练的目标距离累加；没有计划就没有目标，
 * 那一格写「无计划目标」而不是拿 0 当目标画一个满环。
 */

interface Props {
  readonly actualDistanceM: number | null;
  readonly plannedDistanceM: number | null;
  readonly completedSessions: number | null;
  readonly plannedSessions: number | null;
  readonly elevationM: number | null;
  readonly testId?: string;
}

export function DemoMonthSummary({
  actualDistanceM,
  plannedDistanceM,
  completedSessions,
  plannedSessions,
  elevationM,
  testId,
}: Props) {
  const actualKm = actualDistanceM != null ? actualDistanceM / 1000 : null;
  const plannedKm = plannedDistanceM != null ? plannedDistanceM / 1000 : null;
  const distancePct =
    actualKm != null && plannedKm != null && plannedKm > 0
      ? (actualKm / plannedKm) * 100
      : null;
  const sessionPct =
    completedSessions != null && plannedSessions != null && plannedSessions > 0
      ? (completedSessions / plannedSessions) * 100
      : null;

  return (
    <Card
      padding="md"
      data-testid={testId ?? "demo-month-summary"}
      className="relative"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <span className="absolute -bottom-10 -right-10 size-28 rounded-full bg-accent/5 blur-2xl" />
      </div>

      <div className="relative grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
        <Cell
          label="月度跑量"
          value={actualKm != null ? actualKm.toFixed(1) : NO_VALUE}
          target={plannedKm != null ? `/ ${plannedKm.toFixed(1)}k` : null}
          percent={distancePct}
          tone="accent"
        />
        <Cell
          label="训练课次"
          value={completedSessions != null ? String(completedSessions) : NO_VALUE}
          target={plannedSessions != null ? `/ ${plannedSessions} 次` : null}
          percent={sessionPct}
          tone="warm"
        />
        <Cell
          label="累计爬升"
          value={elevationM != null ? Math.round(elevationM).toString() : NO_VALUE}
          target="m"
          percent={null}
          tone="tertiary"
        />
      </div>
    </Card>
  );
}

/**
 * 一格摘要：标签、当前值、目标、进度条。
 */
function Cell({
  label,
  value,
  target,
  percent,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly target: string | null;
  readonly percent: number | null;
  readonly tone: "accent" | "warm" | "tertiary";
}) {
  const dotClass =
    tone === "accent"
      ? "bg-accent"
      : tone === "warm"
        ? "bg-secondary-container"
        : "bg-tertiary-dim";
  return (
    <div className="min-w-0">
      <p className="flex min-w-0 items-center gap-1.5 text-caption1 text-text-muted">
        <span aria-hidden="true" className={`size-1.5 rounded-full ${dotClass}`} />
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1 flex min-w-0 flex-wrap items-baseline gap-1">
        <span className="font-mono text-title2 font-bold tabular-nums text-text-primary">
          {value}
        </span>
        {target ? (
          <span className="font-mono text-caption1 text-text-muted">{target}</span>
        ) : null}
      </p>
      {percent != null ? (
        <>
          <div className="mt-2">
            <ProgressBar
              percent={Math.min(100, percent)}
              label={`${label}达成率`}
              tone={tone === "warm" ? "secondary" : tone === "tertiary" ? "tertiary" : "accent"}
              thickness="thin"
            />
          </div>
          <p className="mt-1 font-mono text-caption1 text-accent">
            达成率 {Math.round(percent)}%
          </p>
        </>
      ) : null}
    </div>
  );
}
