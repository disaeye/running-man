"use client";

import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { NO_VALUE } from "@shared/lib/use-data-state";

/**
 * 运动效能评估与恢复建议（参考稿的评估卡）。
 *
 * 参考稿这张卡原本放的是设备自己的训练效益（Aerobic TE / Anaerobic TE）与
 * 恢复时长——那是 Firstbeat 的专有算法，本产品拿不到，也不该自己编一个
 * 换算公式冒充同一件事。
 *
 * 所以这里放能算出来的东西：
 *   · 有氧解耦：同等工作下心率上升的百分比，本系统自己算（`domain.load.decoupling`）
 *   · 心率漂移：长距离后段的配速保持情况，用解耦与分段配速对照
 *   · 训练冲量：来源系统给出的 TRIMP
 *
 * 每一项都写清来源，读者能知道哪个数是谁算的。
 */

interface Props {
  /** 有氧解耦（%）。 */
  readonly decouplingPct: number | null;
  /** 来源系统的 TRIMP。 */
  readonly trimp: number | null;
  /** 设备自己的训练效益（0–5），设备没写就是 null。 */
  readonly aerobicTe: number | null;
  readonly anaerobicTe: number | null;
  readonly testId?: string;
}

export function DemoEffectivenessCard({
  decouplingPct,
  trimp,
  aerobicTe,
  anaerobicTe,
  testId,
}: Props) {
  return (
    <Card data-testid={testId ?? "demo-effectiveness-card"} className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-accent/10 blur-2xl"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/20 text-accent"
          >
            ◈
          </span>
          <div className="min-w-0">
            <LabelCaps className="text-accent">TRAINING EFFECT · 运动效能评估</LabelCaps>
            <h2 className="mt-1 text-title3 font-semibold text-text-primary">
              本次训练的效能与恢复
            </h2>
          </div>
        </div>
        {decouplingPct != null ? (
          <span className="shrink-0 rounded bg-accent px-2 py-0.5 text-caption1 font-bold text-on-primary">
            {decouplingQuality(decouplingPct)}
          </span>
        ) : null}
      </div>

      <div className="relative mt-4 grid grid-cols-2 gap-3">
        <Metric
          label="有氧解耦"
          value={formatSigned(decouplingPct, 1)}
          unit="%"
          note="同等工作下心率的上升幅度"
        />
        <Metric
          label="训练冲量"
          value={trimp == null ? null : String(Math.round(trimp))}
          unit="TRIMP"
          note="来源系统给出的训练冲量"
        />
        <Metric
          label="设备训练效益"
          value={aerobicTe != null ? aerobicTe.toFixed(1) : null}
          unit="有氧 TE"
          note={trainingEffectNote(aerobicTe, anaerobicTe)}
        />
      </div>

      <p className="relative mt-3 text-caption1 text-text-muted">
        有氧解耦由本系统计算；TRIMP 与训练效益来自设备与来源系统。
      </p>
    </Card>
  );
}

/** 带符号的读数。空值是空值，不写 0。 */
function formatSigned(value: number | null, digits: number): string | null {
  if (value == null) return null;
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

/** 设备训练效益的说明行。 */
function trainingEffectNote(
  aerobicTe: number | null,
  anaerobicTe: number | null,
): string {
  if (aerobicTe == null) return "设备未写入训练效益";
  return `无氧 TE ${anaerobicTe != null ? anaerobicTe.toFixed(1) : NO_VALUE}`;
}

/**
 * 一格读数：标签、值、单位、说明。
 *
 * 没有值时写占位符，不写 0。
 */
function Metric({
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
    <div className="flex flex-col justify-between rounded-lg bg-surface-overlay px-3 py-2.5">
      <p className="text-caption1 text-text-muted">{label}</p>
      {value == null ? (
        <p className="mt-1 text-caption1 text-text-muted">{NO_VALUE}</p>
      ) : (
        <p className="mt-1 flex items-baseline gap-1">
          <span className="font-mono text-title2 font-bold tabular-nums text-accent">
            {value}
          </span>
          <span className="text-caption1 text-text-muted">{unit}</span>
        </p>
      )}
      <p className="mt-1.5 text-caption1 text-text-muted">{note}</p>
    </div>
  );
}

/**
 * 解耦的质量描述。
 *
 * 阈值取的是耐力训练的常用界值：5% 以内是稳态，5–10% 可接受，10–15%
 * 偏高，15% 以上是显著漂移。正值意味着后段更费心率。
 */
function decouplingQuality(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 5) return "稳态";
  if (abs < 10) return "可接受";
  if (abs < 15) return "偏高";
  return "显著漂移";
}
