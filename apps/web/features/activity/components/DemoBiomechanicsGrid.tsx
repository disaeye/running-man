"use client";

import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { Biomechanics } from "@features/activity/hooks/useActivityAnalysis";

/**
 * 生物力学与动力学监测矩阵（参考稿的六格矩阵）。
 *
 * 六格分别是：平均心率、平均步频、平均步幅、垂直振幅、触地时间、触地平衡。
 *
 * 格子永远在：设备没有记录某一项时那一格写「未记录」并说明原因，
 * 而不是把格子藏起来。格子布局固定，读者才知道该去哪里找这一项；
 * 换了设备（比如换成带跑步动力学的手表）它会自动补上。
 *
 * 点一格会在下方展开那一项的时序曲线，曲线来自活动的真实流数据。
 */

interface Props {
  readonly biomechanics: Biomechanics | null;
  readonly heartRate: { readonly avg: number | null; readonly max: number | null };
  /** 展开的曲线：指标名。 */
  readonly activeMetric: string | null;
  readonly onSelectMetric: (metric: string | null) => void;
  /** 曲线的承载区（由父层渲染真正的图表）。 */
  readonly chartSlot?: React.ReactNode;
  readonly testId?: string;
}

interface Cell {
  readonly key: string;
  readonly label: string;
  readonly value: number | null;
  readonly unit: string;
  /** 这一格的数据来自哪里；缺数据时说明原因。 */
  readonly source: string;
  readonly tone: "accent" | "tertiary" | "warm";
}

export function DemoBiomechanicsGrid({
  biomechanics,
  heartRate,
  activeMetric,
  onSelectMetric,
  chartSlot,
  testId,
}: Props) {
  const cells: Cell[] = [
    {
      key: "heart_rate",
      label: "平均心率",
      value: heartRate.avg,
      unit: "BPM",
      source: "活动摘要",
      tone: "warm",
    },
    {
      key: "cadence",
      label: "平均步频",
      value: biomechanics?.avg_cadence_spm ?? null,
      unit: "SPM",
      source: "设备步频",
      tone: "accent",
    },
    {
      key: "stride_length",
      label: "平均步幅",
      value: biomechanics?.avg_stride_length_m ?? null,
      unit: "M",
      source: "设备步幅",
      tone: "tertiary",
    },
    {
      key: "vertical_oscillation",
      label: "垂直振幅",
      value: biomechanics?.avg_vertical_oscillation_cm ?? null,
      unit: "CM",
      source: "跑步动力学传感器",
      tone: "tertiary",
    },
    {
      key: "ground_contact_time",
      label: "触地时间 (GCT)",
      value: biomechanics?.avg_ground_contact_time_ms ?? null,
      unit: "MS",
      source: "跑步动力学传感器",
      tone: "accent",
    },
    {
      key: "lr_balance",
      label: "触地平衡 (L/R)",
      value: biomechanics?.avg_lr_balance_pct ?? null,
      unit: "%L",
      source: "跑步动力学传感器",
      tone: "accent",
    },
  ];

  return (
    <Card data-testid={testId ?? "demo-biomechanics-grid"}>
      <div className="flex items-center justify-between gap-3">
        <LabelCaps icon={<span>◈</span>}>BIOMECHANICS · 生物力学与动力学监测</LabelCaps>
        <span className="font-mono text-caption1 text-text-muted">实时传感器矩阵</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {cells.map((cell) => {
          const active = activeMetric === cell.key;
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => onSelectMetric(active ? null : cell.key)}
              aria-pressed={active}
              className={`focus-ring min-w-0 rounded-xl px-3 py-2.5 text-left transition-colors ${
                active
                  ? "bg-surface-active"
                  : "bg-surface-overlay hover:bg-surface-active"
              }`}
              data-testid={`demo-biomechanics-${cell.key}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-caption1 text-text-muted">{cell.label}</span>
                <span
                  aria-hidden="true"
                  className={`text-caption1 ${
                    cell.tone === "accent"
                      ? "text-accent"
                      : cell.tone === "tertiary"
                        ? "text-tertiary"
                        : "text-warm"
                  }`}
                >
                  ◉
                </span>
              </div>
              {cell.value == null ? (
                <>
                  <p className="mt-1 text-caption1 text-text-muted">{NO_VALUE}</p>
                  <p className="mt-0.5 text-caption1 text-text-muted">
                    当前设备未记录（{cell.source}）
                  </p>
                </>
              ) : (
                <p className="mt-1 flex items-baseline gap-1">
                  <span
                    className={`font-mono text-title2 font-bold tabular-nums ${
                      cell.tone === "accent"
                        ? "text-accent"
                        : cell.tone === "tertiary"
                          ? "text-tertiary"
                          : "text-warm"
                    }`}
                  >
                    {formatCell(cell.value)}
                  </span>
                  <span className="text-caption1 text-text-muted">{cell.unit}</span>
                </p>
              )}
            </button>
          );
        })}
      </div>

      {activeMetric ? (
        <div className="mt-3 border-t border-border-subtle pt-3">
          {chartSlot ?? (
            <p className="text-caption1 text-text-muted">
              这项没有可画的时序序列
            </p>
          )}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * 一格的数值。
 *
 * 步幅与垂直振幅保留一位小数，其余取整。
 */
function formatCell(value: number): string {
  if (value >= 100) return Math.round(value).toString();
  return value >= 10 ? value.toFixed(1) : value.toFixed(2);
}
