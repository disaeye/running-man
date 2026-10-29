"use client";

import { useMemo, useState } from "react";
import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatPaceFromSeconds } from "@shared/lib/format";
import type { Lap } from "@features/activity/hooks/useActivityAnalysis";

/**
 * 每公里逐段配速表（参考稿的分段表）。
 *
 * 每一行是公里号、分段配速、相对速度条、分段心率。最快的一段高亮。
 *
 * 段数多的时候默认只显示首尾与关键段，中间折叠成一行「展开全部 N 公里」。
 * 手机上放不下二十几行，读者的目标通常是「最后几公里怎么样」和
 * 「最快的是哪一段」，所以这两头必须在第一屏。
 */

interface Props {
  readonly laps: readonly Lap[];
  /** 最快分段的分段序号（接口算出来的）。 */
  readonly fastestLapIndex: number | null;
  readonly testId?: string;
}

/** 一行分段：分段本身，加上这一段的配速。 */
interface SplitRowView {
  readonly lap: Lap;
  /** 配速（秒/公里）。没有时间的分段没有配速。 */
  readonly pace: number;
}

/** 第一屏显示的行数：首 3 段 + 最快段 + 末 3 段。 */
const HEAD_ROWS = 3;
const TAIL_ROWS = 3;

export function DemoSplitTable({
  laps,
  fastestLapIndex,
  testId,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const withPace = useMemo(() => buildRows(laps), [laps]);

  if (laps.length === 0) {
    return (
      <Card data-testid={testId ?? "demo-split-table"}>
        <LabelCaps>KILOMETER SPLITS · 每公里逐段配速分析</LabelCaps>
        <p className="mt-3 text-caption1 text-text-muted">
          这条记录没有可用的分段数据
        </p>
      </Card>
    );
  }

  const fastestPace =
    fastestLapIndex != null
      ? withPace.find((row) => row.lap.lap_index === fastestLapIndex)?.pace ?? null
      : null;
  const paces = withPace.map((row) => row.pace);
  const slowest = paces.length > 0 ? Math.max(...paces) : 0;
  const fastest = paces.length > 0 ? Math.min(...paces) : 0;

  const visible = expanded
    ? withPace
    : collapseMiddle(withPace, fastestLapIndex);

  return (
    <Card data-testid={testId ?? "demo-split-table"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <LabelCaps>KILOMETER SPLITS · 每公里逐段配速分析</LabelCaps>
          <h2 className="mt-1 text-title3 font-semibold text-text-primary">
            分段配速表
          </h2>
        </div>
        {fastestPace != null ? (
          <span className="shrink-0 rounded-full bg-surface-overlay px-2.5 py-1 font-mono text-caption1 text-accent">
            最快 {formatPaceFromSeconds(Math.round(fastestPace))}
          </span>
        ) : null}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg bg-surface-overlay">
        <div className="grid grid-cols-12 px-3 py-2 text-caption1 text-text-muted">
          <span className="col-span-2">公里</span>
          <span className="col-span-3">分段配速</span>
          <span className="col-span-4 text-center">相对速度比</span>
          <span className="col-span-3 text-right">心率</span>
        </div>
        <div className="divide-y divide-border-subtle">
          {visible.map((row) => {
            const isFastest = row.lap.lap_index === fastestLapIndex;
            const ratio = fastest > 0 ? fastest / (row.pace as number) : 0;
            return (
              <div
                key={row.lap.lap_index}
                className={`grid grid-cols-12 items-center px-3 py-2 ${
                  isFastest ? "bg-surface-active" : ""
                }`}
                data-testid={`demo-split-row-${row.lap.lap_index}`}
              >
                <span className="col-span-2 flex items-center gap-1">
                  <span
                    className={`font-mono text-caption1 tabular-nums ${
                      isFastest ? "font-bold text-accent" : "text-text-secondary"
                    }`}
                  >
                    {row.lap.lap_index} KM
                  </span>
                  {isFastest ? (
                    <span aria-hidden="true" className="text-caption1 text-accent">
                      ▲
                    </span>
                  ) : null}
                </span>
                <span
                  className={`col-span-3 font-mono text-caption1 tabular-nums ${
                    isFastest ? "font-bold text-accent" : "text-text-secondary"
                  }`}
                >
                  {formatPaceFromSeconds(Math.round(row.pace as number))}
                </span>
                <span className="col-span-4 px-1.5">
                  <span className="block h-2 w-full overflow-hidden rounded-full bg-surface-active">
                    <span
                      className={`block h-full rounded-full ${
                        isFastest ? "bg-accent" : "bg-text-muted"
                      }`}
                      style={{ width: `${Math.min(100, ratio * 100)}%` }}
                    />
                  </span>
                </span>
                <span className="col-span-3 text-right font-mono text-caption1 tabular-nums text-text-muted">
                  {row.lap.avg_hr != null ? `${row.lap.avg_hr} bpm` : NO_VALUE}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {!expanded && withPace.length > HEAD_ROWS + TAIL_ROWS + 1 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="focus-ring mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-surface-overlay text-caption1 font-medium text-text-primary transition-colors hover:bg-surface-active"
        >
          展开全部 {withPace.length} 公里分段
        </button>
      ) : null}
      {expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="focus-ring mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-surface-overlay text-caption1 font-medium text-text-primary transition-colors hover:bg-surface-active"
        >
          收起
        </button>
      ) : null}

      {slowest > 0 ? (
        <p className="mt-3 text-caption1 text-text-muted">
          最快 {formatPaceFromSeconds(Math.round(fastest))} · 最慢{" "}
          {formatPaceFromSeconds(Math.round(slowest))}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * 把分段读成带配速的行。
 *
 * 配速优先用接口算好的那个；接口没给（没有时间戳的分段）就用距离与时间
 * 算出来。没有配速的分段不进表：表里的每一行都要能比较。
 */
function buildRows(laps: readonly Lap[]): SplitRowView[] {
  const rows: SplitRowView[] = [];
  for (const lap of laps) {
    const pace =
      lap.pace_s_per_km ??
      (lap.duration_s != null && lap.duration_s > 0 && lap.distance_m > 0
        ? lap.duration_s / (lap.distance_m / 1000)
        : null);
    if (pace == null || pace <= 0) continue;
    rows.push({ lap, pace });
  }
  return rows;
}

/**
 * 折叠中间段：保留首 3 段、最快段与末 3 段。
 */
function collapseMiddle(
  rows: readonly SplitRowView[],
  fastestLapIndex: number | null,
): SplitRowView[] {
  if (rows.length <= HEAD_ROWS + TAIL_ROWS + 1) return [...rows];
  const head = rows.slice(0, HEAD_ROWS);
  const tail = rows.slice(rows.length - TAIL_ROWS);
  const fastestRow =
    fastestLapIndex != null
      ? rows.find((row) => row.lap.lap_index === fastestLapIndex)
      : undefined;
  const middle: SplitRowView[] = [];
  if (fastestRow && !head.includes(fastestRow) && !tail.includes(fastestRow)) {
    middle.push(fastestRow);
  }
  return [...head, ...middle, ...tail];
}
