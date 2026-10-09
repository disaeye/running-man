"use client";

import { Activity, AlertCircle, Heart, Moon } from "lucide-react";
import type { Assessment } from "@features/today/lib/readiness-presentation";
import type { DataCaveat } from "@features/today/hooks/useCoachContext";
import type { WellnessPoint } from "@features/health/hooks/useWellness";

interface HomeBodySignalsProps {
  latestWellness: WellnessPoint | undefined;
  sleepAvg7d: number | null | undefined;
  caveats: readonly DataCaveat[];
  assessment: Assessment;
}

export function HomeBodySignals({
  latestWellness,
  sleepAvg7d,
  caveats,
  assessment,
}: HomeBodySignalsProps) {
  const hrv = latestWellness?.hrv;
  const restingHr = latestWellness?.resting_hr;
  const sleepSecs = latestWellness?.sleep_secs;
  const sleepHours = sleepSecs != null ? (sleepSecs / 3600).toFixed(1) : null;

  return (
    <article
      className="bento-status glass-surface relative flex flex-col justify-between rounded-2xl border border-border-subtle p-4 sm:p-6"
      aria-labelledby="signals-heading"
    >
      <div className="space-y-4 sm:space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 id="signals-heading" className="text-caption1 font-medium tracking-wide text-text-muted">
            生理恢复指标
          </h2>
          <Activity className="size-4 text-text-muted" aria-hidden="true" />
        </div>

        {/* Signals List */}
        <div className="divide-y divide-border-subtle/60 rounded-xl border border-border-subtle bg-surface-overlay/30 px-3 py-1">
          {/* Sleep */}
          <SignalItem
            icon={<Moon className="size-4" aria-hidden="true" />}
            title="昨夜睡眠"
            subtitle={sleepAvg7d != null && sleepAvg7d > 0 ? `7日均值 ${sleepAvg7d}h` : "无近期记录"}
            value={sleepHours != null ? `${sleepHours}` : null}
            unit="h"
          />

          {/* HRV */}
          <SignalItem
            icon={<Activity className="size-4 text-emerald-400" aria-hidden="true" />}
            title="心率变异性 (HRV)"
            subtitle="自主神经恢复"
            value={hrv != null ? `${Math.round(hrv)}` : null}
            unit="ms"
            accent="text-emerald-400"
          />

          {/* Resting HR */}
          <SignalItem
            icon={<Heart className="size-4 text-rose-400" aria-hidden="true" />}
            title="晨间静息心率"
            subtitle="晨间生理基线"
            value={restingHr != null ? `${Math.round(restingHr)}` : null}
            unit="bpm"
          />
        </div>

        {/* Caveats alert box */}
        {caveats.length > 0 && (
          <div
            className="space-y-1.5 rounded-xl border border-warning/20 bg-warning/5 p-3"
            data-testid="recovery-caveats"
          >
            {caveats.map((caveat) => (
              <div
                key={caveat.field}
                className="flex items-start gap-2 text-caption1 text-warning"
              >
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span className="leading-snug">
                  {caveat.issue}，{caveat.impact}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Evaluation Status */}
      <div className="mt-4 flex items-center justify-between rounded-xl border border-border-subtle bg-surface-overlay/40 px-3 py-2.5 sm:mt-5 text-caption1">
        <span className="text-text-muted">就绪评估</span>
        <span className="font-semibold text-text-primary">
          {assessment.available ? assessment.levelLabel : "待建立基线"}
        </span>
      </div>
    </article>
  );
}

function SignalItem({
  icon,
  title,
  subtitle,
  value,
  unit,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  value: string | null;
  unit: string;
  accent?: string;
}) {
  const isPending = value == null;

  return (
    <div className="flex items-center justify-between py-2.5 px-1 rounded-lg transition-colors active:bg-surface-overlay/50">
      <div className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-overlay text-text-muted">
          {icon}
        </div>
        <div>
          <span className="block text-subheadline font-medium text-text-primary">{title}</span>
          <span className="block text-caption1 text-text-muted">{subtitle}</span>
        </div>
      </div>
      <div>
        {isPending ? (
          <span className="rounded bg-surface-overlay px-2 py-0.5 text-caption1 text-text-muted">
            暂无数据
          </span>
        ) : (
          <div className="flex items-baseline gap-1">
            <span className={`font-mono text-title3 font-semibold ${accent || "text-text-primary"}`}>
              {value}
            </span>
            <span className="text-caption1 text-text-muted">{unit}</span>
          </div>
        )}
      </div>
    </div>
  );
}
