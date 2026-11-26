"use client";

import { useMemo } from "react";
import type { StreamMap } from "@shared/types/activity";
import { formatPaceFromSeconds } from "@shared/lib/format";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { StreamMiniChart } from "@features/activity/components/StreamMiniChart";
import { altitudeSeries, formatElapsed, heartRateSeries, paceSeries, sharedDomain } from "@features/activity/lib/stream-series";

interface ActivityStreamChartsProps {
  streams: StreamMap;
  decouplingPct?: number | null;
  efficiencyFactor?: number | null;
  activityStartTime?: string;
  activityDurationS?: number | null;
  hoverTimeSec: number | null;
  onHoverTime: (timeSec: number | null, source: "mouse" | "selection") => void;
}

const TICK_COUNT = 5;

export function ActivityStreamCharts({
  streams,
  decouplingPct,
  efficiencyFactor,
  activityStartTime,
  activityDurationS,
  hoverTimeSec,
  onHoverTime,
}: ActivityStreamChartsProps) {
  const { pace, hr, altitude, domain } = useMemo(() => {
    const pacePoints = paceSeries(streams);
    const hrPoints = heartRateSeries(streams);
    const altPoints = altitudeSeries(streams);
    return {
      pace: pacePoints,
      hr: hrPoints,
      altitude: altPoints,
      domain: sharedDomain([pacePoints, hrPoints, altPoints], activityStartTime, activityDurationS),
    };
  }, [streams, activityStartTime, activityDurationS]);

  return (
    <div className="space-y-3">
      {domain ? (
        <>
          <p className="text-caption1 text-text-muted">按活动记录的有效训练时长展示</p>
          <div className="space-y-3" data-testid="stream-charts">
            <StreamMiniChart title="配速" unit="/km" points={pace} domain={domain} color="var(--color-ctl)" invertY formatValue={(value) => formatPaceFromSeconds(Math.round(value))} hoverTimeSec={hoverTimeSec} onHoverTime={onHoverTime} testId="stream-chart-pace" />
            <StreamMiniChart title="心率" unit="bpm" points={hr} domain={domain} color="var(--color-hr-rest)" formatValue={(value) => String(Math.round(value))} hoverTimeSec={hoverTimeSec} onHoverTime={onHoverTime} testId="stream-chart-hr" />
            {altitude.length > 1 ? (
              <StreamMiniChart title="海拔" unit="m" points={altitude} domain={domain} color="var(--color-weight)" formatValue={(value) => String(Math.round(value))} hoverTimeSec={hoverTimeSec} onHoverTime={onHoverTime} testId="stream-chart-altitude" />
            ) : null}
          </div>
          <TimeAxis domain={domain} hoverTimeSec={hoverTimeSec} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">本次活动没有配速或心率运动流记录</p>
      )}
      <div className="grid grid-cols-2 gap-3 border-t border-border-subtle pt-3">
        <div>
          <div className="text-caption1 text-muted-foreground">有氧漂移</div>
          <div className="num text-title3 font-semibold text-text-primary">{decouplingPct != null ? `${decouplingPct.toFixed(1)}%` : NO_VALUE}</div>
        </div>
        <div>
          <div className="text-caption1 text-muted-foreground">效率 EF</div>
          <div className="num text-title3 font-semibold text-text-primary">{efficiencyFactor != null ? efficiencyFactor.toFixed(2) : NO_VALUE}</div>
        </div>
      </div>
    </div>
  );
}

function TimeAxis({ domain, hoverTimeSec }: { domain: { start: number; end: number }; hoverTimeSec: number | null }) {
  const ticks = Array.from({ length: TICK_COUNT }, (_, index) => ({ key: index, seconds: (index / (TICK_COUNT - 1)) * (domain.end - domain.start) }));
  const hoverRatio = hoverTimeSec != null ? (hoverTimeSec - domain.start) / (domain.end - domain.start) : null;
  const elapsed = hoverTimeSec != null ? hoverTimeSec - domain.start : null;
  return (
    <div className="pl-2 pr-2">
      <div className="relative flex justify-between text-caption1 text-muted-foreground">
        {ticks.map((tick) => <span key={tick.key} className="num">{formatElapsed(tick.seconds)}</span>)}
        {hoverRatio != null ? (
          <span className="num pointer-events-none absolute top-0 -translate-x-1/2 rounded-full bg-primary px-1.5 py-0.5 text-caption1 text-primary-foreground shadow-sm" style={{ left: `${Math.min(0.96, Math.max(0.04, hoverRatio)) * 100}%` }}>
            {formatElapsed(elapsed ?? 0)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
