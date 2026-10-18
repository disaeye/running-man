"use client";

import { AlertCircle, Heart, Moon, Waves } from "lucide-react";
import { Card } from "@shared/ui/Card";
import type { DataCaveat } from "@features/today/hooks/useCoachContext";
import type { WellnessPoint } from "@features/health/hooks/useWellness";

interface HomeBodySignalsProps {
  latestWellness: WellnessPoint | undefined;
  sleepAvg7d: number | null | undefined;
  caveats: readonly DataCaveat[];
}

export function HomeBodySignals({
  latestWellness,
  sleepAvg7d,
  caveats,
}: HomeBodySignalsProps) {
  const hrv = latestWellness?.hrv;
  const restingHr = latestWellness?.resting_hr;
  const sleepSecs = latestWellness?.sleep_secs;
  const sleepHours = sleepSecs != null ? (sleepSecs / 3600).toFixed(1) : null;

  return (
    <Card padding="md" aria-labelledby="signals-heading">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="signals-heading" className="text-caption1 font-medium tracking-wide text-text-muted">
          生理恢复
        </h2>
        <span className="text-caption1 text-text-muted">
          {sleepAvg7d != null && sleepAvg7d > 0 ? `睡眠 7 日均 ${sleepAvg7d}h` : "无近期记录"}
        </span>
      </div>

      <dl className="mt-3">
        <SignalRow
          icon={<Moon className="size-4" aria-hidden="true" />}
          title="昨夜睡眠"
          value={sleepHours}
          unit="h"
        />
        <SignalRow
          icon={<Waves className="size-4" aria-hidden="true" />}
          title="心率变异 (HRV)"
          value={hrv != null ? `${Math.round(hrv)}` : null}
          unit="ms"
        />
        <SignalRow
          icon={<Heart className="size-4" aria-hidden="true" />}
          title="晨间静息心率"
          value={restingHr != null ? `${Math.round(restingHr)}` : null}
          unit="bpm"
        />
      </dl>

      {caveats.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-border-subtle pt-3" data-testid="recovery-caveats">
          {caveats.map((caveat) => (
            <p
              key={caveat.field}
              className="flex items-start gap-2 text-caption1 leading-snug text-warning"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                {caveat.issue}，{caveat.impact}
              </span>
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

function SignalRow({
  icon,
  title,
  value,
  unit,
}: {
  icon: React.ReactNode;
  title: string;
  value: string | null;
  unit: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border-subtle py-2.5 first:border-t-0 first:pt-0">
      <dt className="flex items-center gap-2 text-subheadline text-text-secondary">
        <span className="text-text-muted">{icon}</span>
        {title}
      </dt>
      <dd className="flex items-baseline gap-1">
        {value == null ? (
          <span className="text-caption1 text-text-muted">暂无数据</span>
        ) : (
          <>
            <span className="font-mono text-title3 font-semibold tabular-nums text-text-primary">
              {value}
            </span>
            <span className="text-caption1 text-text-muted">{unit}</span>
          </>
        )}
      </dd>
    </div>
  );
}
