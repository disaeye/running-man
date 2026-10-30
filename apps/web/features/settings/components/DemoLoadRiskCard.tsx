"use client";

import { Card } from "@shared/ui/Card";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { RangeFigure } from "@features/today/hooks/usePersonalRange";

/**
 * 展示近期恢复指标与本地计算的恢复读数。
 */

interface Props {
  readonly figures: readonly RangeFigure[];
  /** 恢复指数（0–100）。没有足够记录时不显示。 */
  readonly recoveryIndex?: number | null;
  readonly testId?: string;
}

export function DemoLoadRiskCard({
  figures,
  recoveryIndex,
  testId,
}: Props) {
  const hrv = figures.find((figure) => figure.key === "hrv");

  return (
    <Card data-testid={testId ?? "demo-load-risk-card"}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-title3 font-semibold text-text-primary">恢复情况</h2>
        <span className="font-mono text-caption1 text-accent">
          {recoveryIndex != null ? `${Math.round(recoveryIndex)}%` : NO_VALUE}
        </span>
      </div>

      <div className="mt-4">
        <Reading
          label="心率变异性 HRV"
          value={hrv?.value != null ? Math.round(hrv.value).toString() : null}
          unit="ms"
          note={
            hrv?.minimum != null && hrv?.maximum != null
              ? `个人区间 ${Math.round(hrv.minimum)} – ${Math.round(hrv.maximum)} ms`
              : "历史记录不足，尚未建立区间"
          }
        />
      </div>

      <div className="mt-3 rounded-lg bg-surface-overlay px-3 py-2.5">
        <p className="text-caption1 font-medium text-text-secondary">恢复指数</p>
        <p className="mt-1 text-caption1 text-text-muted">
          {recoveryIndex != null
            ? "本地计算值，综合近期睡眠、静息心率与心率变异。"
            : "睡眠、静息心率与心率变异记录不足，暂不计算恢复指数。"}
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
