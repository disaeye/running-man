"use client";

import { useState } from "react";
import { Check, Download, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@shared/ui/button";
import { MetricHelpTip } from "@shared/ui/MetricHelpTip";
import type { AutoCalcResult } from "./settings-training-params-model";
import {
  buildEstimateRows,
  buildSyncedRows,
  formatComputedAt,
  TREND_GLYPH,
  TREND_LABEL,
  type EstimateKey,
  type SyncReadingsControl,
} from "../lib/physiology-estimate";

export type { SyncedReadingInput, SyncReadingsControl } from "../lib/physiology-estimate";

interface Props {
  readonly result: AutoCalcResult | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly current: {
    readonly hr_max: number | null;
    readonly lthr: number | null;
    readonly threshold_pace: number | null;
  };
  readonly lastComputedAt: string | null;
  readonly onCalculate: () => void;
  readonly onApply: (patch: Partial<Record<EstimateKey, number>>) => void;
  readonly syncReadings: SyncReadingsControl;
}

/** 统一收纳「自动估算（训练记录）」与「同步带入（健康读数）」的触发入口与对照结果。 */
export function PhysiologyEstimate({
  result,
  loading,
  error,
  current,
  lastComputedAt,
  onCalculate,
  onApply,
  syncReadings,
}: Props) {
  const [showSynced, setShowSynced] = useState(false);
  const rows = result ? buildEstimateRows(result, current) : [];
  const usable = rows.filter((row) => row.value != null);
  const computedAt = formatComputedAt(lastComputedAt);

  const syncedRows = buildSyncedRows(syncReadings);
  const applicableSync = syncedRows.filter((r) => r.nextValue != null && r.differs);

  const applyAllEstimated = () => {
    const patch: Partial<Record<EstimateKey, number>> = {};
    for (const row of usable) {
      if (row.value != null) patch[row.key] = row.value;
    }
    onApply(patch);
  };

  const applyAllSynced = () => {
    const patch: { resting_hr?: number; weight_kg?: number } = {};
    for (const row of applicableSync) {
      if (row.key === "resting_hr" && row.nextValue != null) patch.resting_hr = row.nextValue;
      if (row.key === "weight_kg" && row.nextValue != null) patch.weight_kg = row.nextValue;
    }
    syncReadings.onApply(patch);
  };

  const handlePullSync = () => {
    setShowSynced(true);
    syncReadings.onPull();
  };

  return (
    <section className="mb-4 border-b border-border-subtle pb-4" data-testid="physiology-estimate">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-1">
            <p className="text-subheadline font-medium text-text-primary">从训练与健康记录获取</p>
            <MetricHelpTip
              label="参数获取方式"
              text="可从跑步记录估算「最大心率、乳酸阈心率、阈值配速」，也可读取同步的「静息心率、体重」；采用只填表，保存后生效。"
            />
          </div>
          <p className="mt-0.5 text-caption1 text-text-muted" data-testid="estimate-computed-at">
            {computedAt ? `上次估算 ${computedAt}` : "还没有估算过"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onCalculate} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> 估算中…
              </>
            ) : result ? (
              <>
                <RefreshCw className="size-4" aria-hidden="true" /> 重新估算
              </>
            ) : (
              <>
                <Sparkles className="size-4" aria-hidden="true" /> 开始估算
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handlePullSync}
            disabled={syncReadings.loading}
            data-testid="pull-synced-readings"
          >
            {syncReadings.loading ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> 读取中…
              </>
            ) : (
              <>
                <Download className="size-4" aria-hidden="true" /> 读取同步数据
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-caption1 text-error" role="alert">
          估算失败：{error}
        </p>
      )}
      {syncReadings.error && (
        <p className="mt-3 text-caption1 text-error" role="alert">
          读取同步数据失败：{syncReadings.error}
        </p>
      )}

      {result && (
        <div className="mt-3">
          <ul className="divide-y divide-border-subtle border-y border-border-subtle">
            {rows.map((row) => (
              <li
                key={row.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 py-2 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto]"
                data-testid={`estimate-row-${row.key}`}
              >
                <span className="text-caption1 font-medium text-text-secondary">{row.label}</span>
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  {row.shortfall ? (
                    <p className="text-caption1 text-text-muted" data-testid={`estimate-short-${row.key}`}>
                      {row.shortfall}
                    </p>
                  ) : (
                    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-caption1">
                      <span className="tabular-nums text-text-muted line-through decoration-border-strong">
                        {row.current}
                      </span>
                      <span aria-hidden="true" className="text-text-muted">→</span>
                      <span className="font-medium tabular-nums text-text-primary">{row.estimate}</span>
                      {row.trend && (
                        <span className="text-text-secondary" data-testid={`estimate-trend-${row.key}`}>
                          {TREND_GLYPH[row.trend]} {TREND_LABEL[row.trend]}
                        </span>
                      )}
                      <span className="text-text-muted">{row.basis}</span>
                    </p>
                  )}
                </div>
                {row.value != null && (
                  <button
                    type="button"
                    onClick={() => onApply({ [row.key]: row.value! })}
                    className="focus-ring col-start-2 row-start-1 inline-flex min-h-11 items-center text-caption1 font-medium text-accent-strong hover:underline sm:col-start-3"
                  >
                    采用
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {usable.length > 1 && (
              <Button size="sm" onClick={applyAllEstimated}>
                <Check className="size-4" aria-hidden="true" /> 全部采用
              </Button>
            )}
            <p className="text-caption1 text-text-muted">
              {usable.length === 0
                ? "三项估算数据尚不充分，继续训练并保持同步。"
                : "采用后数值填进下面的表单，确认无误再保存。"}
            </p>
          </div>
        </div>
      )}

      {showSynced && (
        <div className="mt-3" data-testid="synced-readings-comparison">
          <ul className="divide-y divide-border-subtle border-y border-border-subtle">
            {syncedRows.map((row) => (
              <li
                key={row.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto]"
                data-testid={`synced-row-${row.key}`}
              >
                <span className="text-caption1 font-medium text-text-secondary">{row.label}</span>
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  {row.nextText == null ? (
                    <p className="text-caption1 text-text-muted">暂无同步健康记录，同步后再试</p>
                  ) : (
                    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-caption1">
                      <span className="tabular-nums text-text-muted">{row.currentText}</span>
                      <span aria-hidden="true" className="text-text-muted">→</span>
                      <span className="font-medium tabular-nums text-text-primary">{row.nextText}</span>
                      <span className="text-text-muted">同步于 {row.day}</span>
                      {!row.differs && <span className="text-text-muted">· 已与表单一致</span>}
                    </p>
                  )}
                </div>
                {row.nextValue != null && row.differs && (
                  <button
                    type="button"
                    onClick={() => syncReadings.onApply({ [row.key]: row.nextValue! })}
                    className="focus-ring col-start-2 row-start-1 inline-flex min-h-11 items-center text-caption1 font-medium text-accent-strong hover:underline sm:col-start-3"
                  >
                    采用
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {applicableSync.length > 1 && (
              <Button size="sm" onClick={applyAllSynced}>
                <Check className="size-4" aria-hidden="true" /> 全部采用同步读数
              </Button>
            )}
            <p className="text-caption1 text-text-muted">
              {applicableSync.length > 0
                ? "采用后数值填进下面的表单，确认无误再保存。"
                : syncedRows.every((r) => r.nextValue == null)
                  ? "暂无同步健康记录，完成一次同步或导入后再读取。"
                  : "当前表单已与最新同步读数一致。"}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
