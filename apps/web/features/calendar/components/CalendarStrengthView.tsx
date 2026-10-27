"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useStrengthAnalytics } from "@features/strength/hooks/useStrengthAnalytics";
import { Card } from "@shared/ui/Card";
import { EmptyState } from "@shared/ui/EmptyState";
import { DateRangePicker } from "@shared/ui/DateRangePicker";
import { Skeleton } from "@shared/ui/Skeleton";
import { StrengthTabContent } from "@features/strength/components/StrengthTabContent";
import { MuscleVolumeChart } from "@features/strength/components/MuscleVolumeChart";
import { E1rmTable } from "@features/strength/components/E1rmTable";
import { MuscleDistribution } from "@features/strength/components/MuscleDistribution";
import { computeRange } from "@shared/lib/format";

const DEFAULT_RANGE_DAYS = 90;
const DEFAULT_RANGE = computeRange(DEFAULT_RANGE_DAYS);

/**
 * Strength panel of the /calendar hub.
 *
 * Rendered inside every calendar view, so strength logging sits next to the
 * week it belongs to. The old `/calendar?view=strength` tab showed this same
 * content, so that URL and `/strength` normalise to `?view=list`.
 */
export function CalendarStrengthView() {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <StrengthTabContent />
      </section>
      <StrengthAnalyticsBlock />
    </div>
  );
}

function StrengthAnalyticsBlock() {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(() => DEFAULT_RANGE);
  const { muscleVolume, e1rm, distribution, loading, error } =
    useStrengthAnalytics(range);

  const hasData =
    muscleVolume.length > 0 || e1rm.length > 0 || distribution.length > 0;

  return (
    <section className="flex flex-col gap-4">
      {/* The charts answer a monthly question, so they open on demand and the
          log above them stays the page's subject. */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        data-testid="strength-analytics-toggle"
        className="row-press focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl bg-surface-overlay px-4 py-2 text-left hover:bg-surface-active"
      >
        <span className="min-w-0">
          <span className="block text-caption1 font-semibold text-text-secondary">力量分析</span>
          <span className="mt-0.5 block font-mono text-caption1 text-text-muted">
            {range.from} → {range.to}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-caption1 text-text-muted">
          {open ? "收起" : "展开"}
          {open ? (
            <ChevronUp className="size-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4" aria-hidden="true" />
          )}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-4">
          <DateRangePicker
            from={range.from}
            to={range.to}
            onChange={(from, to) => setRange({ from, to })}
          />

          {loading && <AnalyticsLoadingBar />}

          {error && (
            <Card padding="md" className="bg-error/5">
              <p className="text-subheadline text-error">{error}</p>
            </Card>
          )}

          {!loading && !error && !hasData && (
            <EmptyState
              title="暂无力量训练数据"
              description={`最近 ${DEFAULT_RANGE_DAYS.toString()} 天内未发现力量训练记录，完成训练后将自动生成肌群容量、e1RM 与分布分析。`}
            />
          )}

          {!loading && hasData && (
            <>
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Card padding="md">
                  <h3 className="mb-3 text-caption1 font-semibold text-text-secondary">
                    肌群容量
                  </h3>
                  <MuscleVolumeChart data={muscleVolume} />
                </Card>
                <Card padding="md">
                  <h3 className="mb-3 text-caption1 font-semibold text-text-secondary">
                    肌群分布
                  </h3>
                  <MuscleDistribution data={distribution} />
                </Card>
              </div>
              <Card padding="md">
                <h3 className="mb-3 text-caption1 font-semibold text-text-secondary">
                  预估 1RM (e1RM)
                </h3>
                <E1rmTable data={e1rm} />
              </Card>
            </>
          )}

          {loading && !hasData && <Skeleton className="h-64 w-full rounded-lg" />}
        </div>
      )}
    </section>
  );
}

function AnalyticsLoadingBar() {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-surface-overlay">
      <div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-accent to-atl" />
    </div>
  );
}
