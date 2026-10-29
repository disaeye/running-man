"use client";

import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { RangeFigure } from "@features/today/hooks/usePersonalRange";

/**
 * 体能负荷与恢复监控（参考稿的伤病预防卡）。
 *
 * 三格读数：急慢性负荷比、下肢触地平衡、当前恢复指数。
 *
 * 急慢性负荷比是 PMC 系列算出来的（`domain/load/acwr.py`），它的分区说明
 * 写在 `contracts/v1/metrics.yaml` 里，写在卡片上的就是那一份。
 *
 * 下肢触地平衡来自设备的跑步动力学传感器；当前设备没有这一项时写
 * 「未记录」，不拿一个 50/50 的假平衡填上。
 */

interface Props {
  readonly figures: readonly RangeFigure[];
  /** 触地平衡（左脚占比）。设备没上报时是 null。 */
  readonly lrBalancePct?: number | null;
  /** 恢复指数（0–100）。没有足够记录时不显示。 */
  readonly recoveryIndex?: number | null;
  readonly testId?: string;
}

export function DemoLoadRiskCard({
  figures,
  lrBalancePct,
  recoveryIndex,
  testId,
}: Props) {
  const ctl = figures.find((figure) => figure.key === "ctl");

  return (
    <Card data-testid={testId ?? "demo-load-risk-card"}>
      <div className="flex items-center justify-between gap-3">
        <LabelCaps icon={<span>◉</span>}>LOAD & RECOVERY · 体能负荷与恢复监控</LabelCaps>
        <span className="font-mono text-caption1 text-accent">
          {recoveryIndex != null ? `${Math.round(recoveryIndex)}%` : NO_VALUE}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Reading
          label="体能 CTL"
          value={ctl?.value != null ? Math.round(ctl.value).toString() : null}
          unit="points"
          note={
            ctl?.minimum != null && ctl?.maximum != null
              ? `区间 ${Math.round(ctl.minimum)} – ${Math.round(ctl.maximum)}`
              : "区间尚未建立"
          }
        />
        <Reading
          label="下肢触地平衡 (L/R)"
          value={lrBalancePct != null ? lrBalancePct.toFixed(1) : null}
          unit="%L"
          note={lrBalancePct != null ? "设备上报的左右平衡" : "当前设备未记录"}
        />
      </div>

      <div className="mt-3 rounded-lg bg-surface-overlay px-3 py-2.5">
        <p className="text-caption1 font-medium text-text-secondary">恢复指数</p>
        <p className="mt-1 text-caption1 text-text-muted">
          {recoveryIndex != null
            ? `近 42 天的睡眠、静息心率与近期负荷的综合读数。`
            : "睡眠、静息心率与近期负荷都还没有足够的记录，恢复指数暂不显示。"}
        </p>
      </div>
    </Card>
  );
}

function Reading({
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
    <div className="rounded-lg bg-surface-overlay px-3 py-2.5">
      <p className="text-caption1 text-text-muted">{label}</p>
      {value == null ? (
        <p className="mt-1 text-caption1 text-text-muted">{NO_VALUE}</p>
      ) : (
        <p className="mt-1 flex items-baseline gap-1">
          <span className="font-mono text-title2 font-bold tabular-nums text-text-primary">
            {value}
          </span>
          <span className="text-caption1 text-text-muted">{unit}</span>
        </p>
      )}
      <p className="mt-1 text-caption1 text-text-muted">{note}</p>
    </div>
  );
}
