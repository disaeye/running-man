"use client";

import { Activity } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { CardHeader } from "@shared/ui/CardHeader";
import type { FactorReading } from "@features/today/lib/readiness-factor-values";

/**
 * 准备度卡：一屏唯一的 56px 主数字，加它背后的五个因子。
 *
 * 卡片自己不取数——`HomePortrait` 已经把 `coach-context` 读回来了，
 * 同一份 readiness 也喂给身份条上的状态点，两处不能各请求一次然后各说各话。
 *
 * 分数是这一屏最容易被误读的数字，所以诚实优先：
 * `dataSufficient` 为假时分数位置写「待建立基线」，不印 50。50 分既能表示
 * 「评估为中等」，也能表示「什么都没测到」，而这两种意思相反。
 *
 * 因子格子印的是读数（`FactorReading`），不是接口那句整话：22px 的位置塞一句话，
 * 两列布局下会折成两行，读起来像正文而不是读数。原话留在格子的 `title` 上，
 * 悬停能看到，不占版面。
 */

const UNRECORDED = "未记录";

/** 接口 impact → 注释颜色。注释本身说的是数值差，颜色说的是这个差是好是坏。 */
const NEUTRAL_IMPACT = "text-text-muted";

const IMPACT_CLASS: Record<string, string> = {
  positive: "text-success",
  negative: "text-warning",
  neutral: NEUTRAL_IMPACT,
};

export interface ReadinessFactorView {
  readonly name: string;
  readonly impact: "positive" | "negative" | "neutral";
  readonly detail: string;
}

interface Props {
  readonly score: number | null;
  /** 服务端给的显式回答：这一次到底测到了东西没有。 */
  readonly dataSufficient: boolean;
  /** 15px 结论句。 */
  readonly conclusion: string;
  /** 活动数据截止日，ISO 字符串。 */
  readonly asOf: string | null;
  /** 接口的因子，按 `name` 与读数对位，提供 impact 与悬停原话。 */
  readonly factors: ReadonlyArray<ReadinessFactorView>;
  /** 由 wellness / pmc 算出的五条读数，顺序与展示顺序一致。 */
  readonly values: ReadonlyArray<FactorReading>;
}

function impactClass(impact: string | undefined): string {
  return (impact != null && IMPACT_CLASS[impact]) || NEUTRAL_IMPACT;
}

export function ReadinessCard({
  score,
  dataSufficient,
  conclusion,
  asOf,
  factors,
  values,
}: Props) {
  const dayKey = asOf ? asOf.slice(0, 10) : null;
  const asOfLabel = dayKey ? dayKey.slice(5) : UNRECORDED;
  const measured = dataSufficient && score != null;
  const factorByName = new Map(factors.map((factor) => [factor.name, factor]));

  return (
    <Card>
      <CardHeader
        icon={<Activity className="size-4" />}
        title="准备度"
        trailing={
          <span className="tabular-nums text-caption1 text-text-muted">数据截至 {asOfLabel}</span>
        }
      />

      <div data-testid="home-decision">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-metric-xl font-semibold tabular-nums text-text-primary">
            {measured ? Math.round(score) : "待建立基线"}
          </span>
          {measured ? <span className="text-caption1 text-text-muted">/100</span> : null}
        </div>
        <h1
          data-page-title
          className="mt-2 text-balance text-body leading-snug text-text-secondary"
        >
          <span className="font-normal">{conclusion}</span>
        </h1>
      </div>

      {/*
        因子网格的 testid 无条件存在：它是首屏固定块之一，测的是「结论下面那组依据
        在第几行」，即使一条读数都没有也该占住那一行，而不是让调用方的选择器落空。

        四格读数用发丝线分隔，不用四块凹陷方块：同一个应用里的读数只该有一种形状，
        而四块圆角方块套在卡片里，看上去又像四张卡。
      */}
      <div
        data-testid="home-readings"
        className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border-subtle"
      >
        {values.map((reading) => {
          const factor = factorByName.get(reading.key);
          return (
            <div key={reading.key} className="min-w-0 bg-surface-card px-3 py-2.5" title={factor?.detail}>
              <p className="text-caption1 font-medium text-text-secondary">{reading.label}</p>
              {reading.value == null ? (
                <p className="mt-1 text-caption1 text-text-muted">{UNRECORDED}</p>
              ) : (
                <p className="mt-1 flex items-baseline gap-1">
                  <span className="font-mono text-title2 font-semibold tabular-nums text-text-primary">
                    {reading.value}
                  </span>
                  {reading.unit ? (
                    <span className="text-caption1 text-text-muted">{reading.unit}</span>
                  ) : null}
                </p>
              )}
              {reading.note ? (
                <p className={`mt-1 text-caption1 ${impactClass(factor?.impact)}`}>
                  {reading.note}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
