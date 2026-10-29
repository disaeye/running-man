"use client";

import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { ProgressBar } from "@shared/ui/ProgressBar";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatPaceFromSeconds } from "@shared/lib/format";

/**
 * 本周训练里程进度环（参考稿第三张卡）。
 *
 * 左边是环形进度：环内写实际跑量，环下写「/ 目标」；右边三行分别是周均配速、
 * 本周累计爬升、剩余目标里程。
 *
 * 目标里程来自课表：每个计划课次带自己的目标距离，累加得到本周目标。没有
 * 计划课表就没有目标，环里只写实际跑量，下方写「无周目标」——不拿 0 当目标
 * 画一个空环。
 */

const UNRECORDED = NO_VALUE;

interface Props {
  /** 本周实际跑量（米）。 */
  readonly actualDistanceM: number | null;
  /** 本周计划跑量（米）。没有计划时是 null。 */
  readonly plannedDistanceM: number | null;
  /** 本周累计爬升（米）。 */
  readonly elevationM: number | null;
  /** 本周平均配速（秒/公里）。 */
  readonly avgPaceSPerKm: number | null;
  /** 周序号，写在卡片标题旁。 */
  readonly weekLabel: string;
  readonly testId?: string;
}

export function DemoWeekVolumeCard({
  actualDistanceM,
  plannedDistanceM,
  elevationM,
  avgPaceSPerKm,
  weekLabel,
  testId,
}: Props) {
  const actualKm = actualDistanceM != null ? actualDistanceM / 1000 : null;
  const plannedKm = plannedDistanceM != null ? plannedDistanceM / 1000 : null;
  const hasTarget = plannedKm != null && plannedKm > 0;
  const percent = hasTarget && actualKm != null ? (actualKm / plannedKm) * 100 : 0;
  const remainingKm =
    hasTarget && actualKm != null ? Math.max(0, plannedKm - actualKm) : null;

  return (
    <Card data-testid={testId ?? "demo-week-volume-card"}>
      <div className="flex items-center justify-between gap-3">
        <LabelCaps icon={<span>▦</span>}>
          WEEKLY VOLUME · {weekLabel}
        </LabelCaps>
        {hasTarget ? (
          <span className="font-mono text-caption1 text-accent">
            达成率 {Math.round(percent)}%
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-12 items-center gap-3">
        <div className="col-span-5 flex flex-col items-center justify-center">
          <div className="relative size-24">
            <svg
              aria-hidden="true"
              viewBox="0 0 100 100"
              className="size-full -rotate-90"
            >
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="var(--color-surface-active)"
                strokeWidth="9"
              />
              {hasTarget ? (
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={251.3}
                  strokeDashoffset={251.3 * (1 - Math.min(100, percent) / 100)}
                />
              ) : null}
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-title2 font-bold tabular-nums text-text-primary">
                {actualKm != null ? actualKm.toFixed(1) : NO_VALUE}
              </span>
              {hasTarget ? (
                <span className="text-caption1 text-text-muted">/ {plannedKm.toFixed(1)} KM</span>
              ) : (
                <span className="text-caption1 text-text-muted">KM</span>
              )}
            </span>
          </div>
          {hasTarget ? (
            <div className="mt-2 w-full">
              <ProgressBar
                percent={Math.min(100, percent)}
                label="本周跑量达成率"
                tone="accent"
                thickness="thin"
              />
            </div>
          ) : (
            <p className="mt-2 text-caption1 text-text-muted">无周目标</p>
          )}
        </div>

        <div className="col-span-7 flex flex-col justify-center gap-2">
          <Row
            icon="◷"
            label="周均配速"
            value={
              avgPaceSPerKm != null ? formatPaceFromSeconds(Math.round(avgPaceSPerKm)) : UNRECORDED
            }
            unit={avgPaceSPerKm != null ? "/km" : null}
            tone="accent"
          />
          <Row
            icon="▲"
            label="累计爬升"
            value={elevationM != null ? `${Math.round(elevationM)}` : UNRECORDED}
            unit={elevationM != null ? "m" : null}
            tone="tertiary"
          />
          <Row
            icon="◎"
            label="剩余目标"
            value={remainingKm != null ? remainingKm.toFixed(1) : UNRECORDED}
            unit={remainingKm != null ? "km" : null}
            tone="warm"
          />
        </div>
      </div>
    </Card>
  );
}

function Row({
  icon,
  label,
  value,
  unit,
  tone,
}: {
  readonly icon: string;
  readonly label: string;
  readonly value: string;
  readonly unit: string | null;
  readonly tone: "accent" | "tertiary" | "warm";
}) {
  const toneClass =
    tone === "accent"
      ? "text-accent"
      : tone === "tertiary"
        ? "text-tertiary"
        : "text-warm";
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-overlay px-3 py-2">
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className={`text-caption1 ${toneClass}`}>
          {icon}
        </span>
        <span className="truncate text-caption1 text-text-muted">{label}</span>
      </span>
      <span className="flex shrink-0 items-baseline gap-1">
        <span className={`font-mono text-subheadline font-semibold tabular-nums ${toneClass}`}>
          {value}
        </span>
        {unit ? (
          <span className="text-caption1 text-text-muted">{unit}</span>
        ) : null}
      </span>
    </div>
  );
}

export const WEEK_VOLUME_MISSING = NO_VALUE;
