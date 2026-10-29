"use client";

import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatPaceFromSeconds } from "@shared/lib/format";

/**
 * 核心里程大卡（参考稿的核心执行总里程卡）。
 *
 * 三个读数并排：总距离（大数）、运动耗时、平均配速；下面一行是能量消耗。
 * 完成度百分比只在这次训练对应着一节计划课表时才有——自由训练没有计划，
 * 完成度就没有参照系，所以那一格写运动类型而不是百分比。
 */

interface Props {
  /** 总距离（米）。 */
  readonly distanceM: number | null;
  /** 净运动时间（秒）。 */
  readonly durationS: number | null;
  /** 平均配速（秒/公里）。 */
  readonly paceSPerKm: number | null;
  /** 能量消耗（千卡）。 */
  readonly calories: number | null;
  /** 计划完成度（0–100）。没有计划时是 null。 */
  readonly completionPct: number | null;
  /** 运动类型标签。 */
  readonly sportLabel: string;
  readonly testId?: string;
}

export function DemoActivityHero({
  distanceM,
  durationS,
  paceSPerKm,
  calories,
  completionPct,
  sportLabel,
  testId,
}: Props) {
  const distanceKm = distanceM != null ? distanceM / 1000 : null;

  return (
    <Card data-testid={testId ?? "demo-activity-hero"} className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-accent/10 blur-3xl"
      />

      <div className="relative flex items-baseline justify-between gap-3">
        <LabelCaps>跑步距离</LabelCaps>
        {completionPct != null ? (
          <span className="rounded bg-surface-overlay px-2 py-0.5 font-mono text-caption1 text-accent">
            完成度 {Math.round(completionPct)}%
          </span>
        ) : (
          <span className="rounded bg-surface-overlay px-2 py-0.5 font-mono text-caption1 text-text-secondary">
            {sportLabel}
          </span>
        )}
      </div>

      <div className="relative mt-2 flex items-baseline gap-2">
        <span className="font-mono text-metric-xl font-bold tabular-nums tracking-tight text-text-primary">
          {distanceKm != null ? distanceKm.toFixed(2) : NO_VALUE}
        </span>
        <span className="font-display text-title2 uppercase text-accent">KM</span>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-3 rounded-lg bg-surface-overlay px-3 py-3">
        <Stat
          label="运动耗时"
          value={durationS != null ? formatDuration(durationS) : null}
          note="净运动时间"
        />
        <Stat
          label="平均配速"
          value={
            paceSPerKm != null ? formatPaceFromSeconds(Math.round(paceSPerKm)) : null
          }
          note="/KM"
        />
        <Stat
          label="能量消耗"
          value={calories != null ? String(Math.round(calories)) : null}
          note="KCAL"
        />
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  readonly label: string;
  readonly value: string | null;
  readonly note: string;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <p className="truncate text-caption1 text-text-muted">{label}</p>
      {value == null ? (
        <p className="mt-0.5 text-caption1 text-text-muted">{NO_VALUE}</p>
      ) : (
        <p className="mt-0.5 font-mono text-title2 font-bold tabular-nums text-text-primary">
          {value}
        </p>
      )}
      <p className="mt-0.5 text-caption1 text-text-muted">{note}</p>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
