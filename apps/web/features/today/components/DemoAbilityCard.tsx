"use client";

import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { ProgressBar } from "@shared/ui/ProgressBar";
import { formatPaceFromSeconds } from "@shared/lib/format";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { RangeFigure } from "@features/today/hooks/usePersonalRange";

/**
 * 跑步能力摘要卡片。
 *
 * 两格大数字在左（VDOT 与阈值配速），右边是本人区间里的位置条。
 *
 * 这里没有「超越 92% 同龄跑者」那种说法：产品里没有人群常模表，
 * 那个百分比的参照系不存在。所以每根条都写明参照系是「本人近 90 天区间」，
 * 条的位置是当前值在本人区间里的算术位置。
 */

const UNRECORDED = NO_VALUE;

interface Props {
  /** 跑步能力值（VDOT）。 */
  readonly vdot: number | null;
  /** 阈值配速（秒/公里）。 */
  readonly thresholdPaceSPerKm: number | null;
  /** 本人区间里的位置图。 */
  readonly figures: readonly RangeFigure[];
  /** 区间窗口的天数。 */
  readonly windowDays: number;
  readonly testId?: string;
}

export function DemoAbilityCard({
  vdot,
  thresholdPaceSPerKm,
  figures,
  windowDays,
  testId,
}: Props) {
  const hrv = figures.find((figure) => figure.key === "hrv") ?? null;
  const cadence = figures.find((figure) => figure.key === "cadence") ?? null;

  return (
    <Card data-testid={testId ?? "demo-ability-card"} className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -bottom-10 size-32 rounded-full bg-accent/5 blur-2xl"
      />

      <div className="relative flex items-center justify-between gap-3">
        <LabelCaps icon={<span>◈</span>}>RUNNING PROFILE · 跑步能力</LabelCaps>
        <span className="font-mono text-caption1 text-tertiary">相对本人近 {windowDays} 天区间</span>
      </div>

      <div className="relative mt-4 grid grid-cols-2 gap-3">
        <Figure
          label="跑步能力值 VDOT"
          value={vdot != null ? vdot.toFixed(1) : null}
          unit=""
          note="依据 Daniels 氧气成本曲线换算"
        />
        <Figure
          label="阈值配速"
          value={
            thresholdPaceSPerKm != null
              ? formatPaceFromSeconds(Math.round(thresholdPaceSPerKm))
              : null
          }
          unit="/km"
          note="乳酸阈强度下的可持续配速"
        />
      </div>

      <div className="relative mt-4 rounded-lg bg-surface-overlay px-3 py-3">
        <div className="space-y-3">
          <PositionBar figure={hrv} />
          <PositionBar figure={cadence} />
        </div>
      </div>
    </Card>
  );
}

/**
 * 一格大数字。
 *
 * 没有值时写占位符，不写 0。
 */
function Figure({
  label,
  value,
  unit,
  note,
}: {
  readonly label: string;
  readonly value: string | null;
  readonly unit: string;
  readonly note: string;
}) {
  return (
    <div className="flex flex-col justify-between rounded-lg bg-surface-overlay px-3 py-3">
      <p className="text-caption1 text-text-muted">{label}</p>
      {value == null ? (
        <p className="mt-1 text-subheadline text-text-muted">{UNRECORDED}</p>
      ) : (
        <p className="mt-1 flex items-baseline gap-1">
          <span className="font-mono text-metric-lg font-bold tabular-nums text-accent">
            {value}
          </span>
          {unit ? <span className="text-caption1 text-text-muted">{unit}</span> : null}
        </p>
      )}
      <p className="mt-2 text-caption1 text-text-muted">{note}</p>
    </div>
  );
}

/**
 * 一根区间位置条：标签、当前值、在本人区间里的位置。
 *
 * 区间立不起来（观测太少）时写「样本不足」，不画一条假的条。
 */
function PositionBar({ figure }: { readonly figure: RangeFigure | null }) {
  if (!figure) return null;
  const percent = figure.percent;
  const insufficient = figure.insufficient || percent == null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-caption1 text-text-muted">{figure.label}</span>
        <span className="font-mono text-caption1 font-semibold tabular-nums text-accent">
          {insufficient
            ? "样本不足"
            : `${figure.value?.toFixed(0) ?? UNRECORDED} · ${percent.toFixed(0)}%`}
        </span>
      </div>
      {insufficient ? (
        <p className="mt-1 text-caption1 text-text-muted">
          {figure.observations} 次观测，不足以构成区间
        </p>
      ) : (
        <>
          <div className="mt-1.5">
            <ProgressBar
              percent={percent}
              label={`${figure.label}在本人近 ${90} 天区间的位置`}
              tone="accent"
              thickness="thin"
            />
          </div>
          <p className="mt-1 text-caption1 text-text-muted">
            区间 {figure.minimum?.toFixed(0) ?? NO_VALUE} – {figure.maximum?.toFixed(0) ?? NO_VALUE}
            {figure.unit} · {figure.observations} 次观测
          </p>
        </>
      )}
    </div>
  );
}
