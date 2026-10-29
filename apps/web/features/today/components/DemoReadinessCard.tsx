"use client";

import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { ProgressBar } from "@shared/ui/ProgressBar";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { WellnessReading } from "@features/today/hooks/useReadiness";

/**
 * 今日就绪度与恢复评分卡片（参考稿第一张卡）。
 *
 * 结构照参考稿：卡片头部是标签与状态徽章，下面是分数与环形进度，
 * 再下面是两格健康读数。
 *
 * 两格读数是静息心率与睡眠时长（按决定 2：HRV 在当前账户上没有数据，
 * 换成有数据的读数；HRV 一旦出现就自动换回来）。每格写当前值、单位，
 * 以及与本人七日基线的差。
 */

const UNRECORDED = NO_VALUE;

interface Props {
  readonly score: number | null;
  /** 这一次到底测到了东西没有。 */
  readonly dataSufficient: boolean;
  /** 状态徽章文案，取自 `contracts/v1/readiness-bands.yaml`。 */
  readonly levelLabel: string;
  /** 结论句：这分数意味着什么。 */
  readonly conclusion: string;
  /** 健康读数，与本人七日基线。 */
  readonly readings: {
    readonly resting_hr: WellnessReading | null;
    readonly sleep_secs: WellnessReading | null;
    readonly hrv: WellnessReading | null;
  };
  readonly testId?: string;
  readonly conclusionTestId?: string;
  readonly readingsTestId?: string;
}

export function DemoReadinessCard({
  score,
  dataSufficient,
  levelLabel,
  conclusion,
  readings,
  testId,
  conclusionTestId,
  readingsTestId,
}: Props) {
  const measured = dataSufficient && score != null;
  const percent = measured ? Math.min(100, Math.max(0, score)) : 0;

  return (
    <Card data-testid={testId ?? "demo-readiness-card"} className="relative overflow-hidden">
      {/* 卡角的柔光：只给最上面那张卡，暗示它是这一屏的起点。 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-accent/10 blur-2xl"
      />

      <div className="relative flex items-center justify-between gap-3">
        <LabelCaps icon={<span>◉</span>}>READINESS SCORE</LabelCaps>
        <span className="rounded-full bg-accent/15 px-2.5 py-0.5 font-mono text-caption1 text-accent">
          {measured ? levelLabel : "数据不足"}
        </span>
      </div>

      <div className="relative mt-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-metric-xl font-bold tabular-nums text-text-primary">
              {measured ? Math.round(score) : NO_VALUE}
            </span>
            {measured ? (
              <span className="text-caption1 text-text-muted">/ 100</span>
            ) : null}
          </div>
          <p data-testid={conclusionTestId} className="mt-1 text-body text-text-secondary">{conclusion}</p>
        </div>

        {/* 环形进度：环宽 4px，环内写同一百分数。 */}
        <div className="relative size-16 shrink-0">
          <svg
            aria-hidden="true"
            viewBox="0 0 48 48"
            className="size-full -rotate-90"
          >
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="var(--color-surface-active)"
              strokeWidth="4.5"
            />
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeDasharray={125.6}
              strokeDashoffset={125.6 * (1 - percent / 100)}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-mono text-caption1 font-bold text-accent">
            {measured ? `${Math.round(percent)}%` : NO_VALUE}
          </span>
        </div>
      </div>

      <div data-testid={readingsTestId ?? "home-readings"} className="relative mt-5 grid grid-cols-2 gap-3">
        <Reading
          label="静息心率 RHR"
          reading={readings.resting_hr}
          unit="bpm"
          tone="warm"
        />
        <Reading
          label="睡眠时长"
          reading={readings.sleep_secs}
          unit="h"
          tone="tertiary"
        />
      </div>
    </Card>
  );
}

/**
 * 一格健康读数：标签、当前值、与七日基线的差。
 *
 * 没有测到时写「未记录」，不写 0——0 静息心率不是一个可能的读数。
 */
function Reading({
  label,
  reading,
  unit,
  tone,
}: {
  readonly label: string;
  readonly reading: WellnessReading | null;
  readonly unit: string;
  readonly tone: "warm" | "tertiary";
}) {
  const value = reading?.value ?? null;
  const delta = reading?.delta ?? null;
  const deltaLabel =
    delta == null
      ? null
      : `${delta > 0 ? "+" : ""}${formatDelta(delta, unit)}`;
  return (
    <div className="rounded-lg bg-surface-overlay px-3 py-2">
      <p className="text-caption1 text-text-muted">{label}</p>
      {value == null ? (
        <p className="mt-1 text-caption1 text-text-muted">{UNRECORDED}</p>
      ) : (
        <div className="mt-1 flex items-baseline gap-1">
          <span
            className={`font-mono text-title2 font-bold tabular-nums ${
              tone === "warm" ? "text-warm" : "text-tertiary"
            }`}
          >
            {formatValue(value, unit)}
          </span>
          <span className="text-caption1 text-text-muted">{unit}</span>
        </div>
      )}
      {deltaLabel ? (
        <p
          className={`mt-1 font-mono text-caption1 ${
            tone === "warm" ? "text-warm" : "text-tertiary"
          }`}
        >
          {deltaLabel} 较 7 日均值
        </p>
      ) : null}
    </div>
  );
}

/** 睡眠用小时，一位小数；心率用整数。 */
function formatValue(value: number, unit: string): string {
  if (unit === "h") return (value / 3600).toFixed(1);
  return Math.round(value).toString();
}

function formatDelta(delta: number, unit: string): string {
  if (unit === "h") return `${(delta / 3600).toFixed(1)}h`;
  return Math.round(delta).toString();
}

/**
 * 恢复进度条：把就绪分数画成一条底色条，放在结论下方。
 *
 * 分数与条宽是同一个数，所以读数与图形永远一致。
 */
export function ReadinessBar({ score }: { readonly score: number | null }) {
  if (score == null) {
    return <ProgressBar percent={0} label="恢复进度" tone="muted" />;
  }
  return (
    <ProgressBar
      percent={Math.min(100, Math.max(0, score))}
      label="恢复进度"
      tone="accent"
    />
  );
}

export const READINESS_MISSING = NO_VALUE;
