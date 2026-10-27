"use client";

import { Check, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@shared/ui/button";
import type { AutoCalcResult } from "./settings-training-params-model";
import {
  buildEstimateRows,
  formatComputedAt,
  TREND_GLYPH,
  TREND_LABEL,
  type EstimateKey,
} from "../lib/physiology-estimate";

/**
 * The one place the three thresholds are estimated.
 *
 * It used to exist twice: a 「自动计算」 button inside the parameter form that
 * filled fields without saving, and a separate 「自动估算」 card below that saved
 * immediately through a second request. The same computation therefore had two
 * buttons, two result layouts and two meanings for "apply".
 *
 * Here the estimate is a comparison the athlete reads before anything changes:
 * current value, estimated value, the evidence behind it and how confident the
 * algorithm is. Applying writes the form; the form's 保存 is the only write.
 */
interface Props {
  readonly result: AutoCalcResult | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly current: {
    readonly hr_max: number | null;
    readonly lthr: number | null;
    readonly threshold_pace: number | null;
  };
  /** When the thresholds were last written by an estimate, if ever. */
  readonly lastComputedAt: string | null;
  readonly onCalculate: () => void;
  readonly onApply: (patch: Partial<Record<EstimateKey, number>>) => void;
}

export function PhysiologyEstimate({
  result,
  loading,
  error,
  current,
  lastComputedAt,
  onCalculate,
  onApply,
}: Props) {
  const rows = result ? buildEstimateRows(result, current) : [];
  const usable = rows.filter((row) => row.value != null);
  const computedAt = formatComputedAt(lastComputedAt);

  const applyAll = () => {
    const patch: Partial<Record<EstimateKey, number>> = {};
    for (const row of usable) {
      if (row.value != null) patch[row.key] = row.value;
    }
    onApply(patch);
  };

  return (
    <section className="mb-5 border-b border-border-subtle pb-5" data-testid="physiology-estimate">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-subheadline font-medium text-text-primary">从训练记录估算</p>
          <p className="mt-0.5 text-caption1 text-text-muted">
            最大心率、乳酸阈心率、阈值配速。导入新记录后自动重算；采用只填表，保存后生效。
          </p>
          <p className="mt-1 text-caption1 text-text-muted" data-testid="estimate-computed-at">
            {computedAt ? `上次估算 ${computedAt}` : "还没有估算过"}
          </p>
        </div>
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
      </div>

      {error && (
        <p className="mt-3 text-caption1 text-error" role="alert">
          估算失败：{error}
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
                      <span aria-hidden="true" className="text-text-muted">
                        →
                      </span>
                      <span className="font-medium tabular-nums text-text-primary">{row.estimate}</span>
                      {row.trend && (
                        <span
                          className="text-text-secondary"
                          data-testid={`estimate-trend-${row.key}`}
                        >
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
              <Button size="sm" onClick={applyAll}>
                <Check className="size-4" aria-hidden="true" /> 全部采用
              </Button>
            )}
            <p className="text-caption1 text-text-muted">
              {usable.length === 0
                ? "三项都没有足够的数据，继续训练并保持同步。"
                : "采用后数值填进下面的表单，确认无误再保存。"}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
