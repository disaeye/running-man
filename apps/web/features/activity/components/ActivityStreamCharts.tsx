"use client";

import { useMemo, useState } from "react";
import type { StreamMap } from "@shared/types/activity";
import { formatPaceFromSeconds } from "@shared/lib/format";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { StreamMiniChart } from "@features/activity/components/StreamMiniChart";
import {
  altitudeSeries,
  formatElapsed,
  heartRateSeries,
  paceSeries,
  sharedDomain,
} from "@features/activity/lib/stream-series";

interface ActivityStreamChartsProps {
  streams: StreamMap;
  decouplingPct?: number | null;
  efficiencyFactor?: number | null;
  /** 悬停图表时回调对应时刻（秒），用于地图联动 */
  onHoverTime?: (timeSec: number | null) => void;
}

const TICK_COUNT = 5;

/** 三条流共用一条时间轴，指针移动时三格同时读数 */
export function ActivityStreamCharts({
  streams,
  decouplingPct,
  efficiencyFactor,
  onHoverTime,
}: ActivityStreamChartsProps) {
  const [hoverTimeSec, setHoverTimeSec] = useState<number | null>(null);

  const { pace, hr, altitude, domain } = useMemo(() => {
    const pacePoints = paceSeries(streams);
    const hrPoints = heartRateSeries(streams);
    const altPoints = altitudeSeries(streams);
    return {
      pace: pacePoints,
      hr: hrPoints,
      altitude: altPoints,
      domain: sharedDomain([pacePoints, hrPoints, altPoints]),
    };
  }, [streams]);

  const handleHover = (timeSec: number | null) => {
    setHoverTimeSec(timeSec);
    onHoverTime?.(timeSec);
  };

  return (
    <div className="space-y-3">
      {domain ? (
        <>
          <div className="space-y-3" data-testid="stream-charts">
            <StreamMiniChart
              title="配速"
              unit="/km"
              points={pace}
              domain={domain}
              color="var(--color-primary)"
              invertY={true}
              formatValue={(value) => formatPaceFromSeconds(Math.round(value))}
              hoverTimeSec={hoverTimeSec}
              onHoverTime={handleHover}
              testId="stream-chart-pace"
            />
            <StreamMiniChart
              title="心率"
              unit="bpm"
              points={hr}
              domain={domain}
              color="var(--color-destructive)"
              formatValue={(value) => String(Math.round(value))}
              hoverTimeSec={hoverTimeSec}
              onHoverTime={handleHover}
              testId="stream-chart-hr"
            />
            <StreamMiniChart
              title="海拔"
              unit="m"
              points={altitude}
              domain={domain}
              color="var(--color-fitness)"
              formatValue={(value) => String(Math.round(value))}
              hoverTimeSec={hoverTimeSec}
              onHoverTime={handleHover}
              testId="stream-chart-altitude"
            />
          </div>
          <TimeAxis domain={domain} hoverTimeSec={hoverTimeSec} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">暂无运动流数据</p>
      )}

      <div className="grid grid-cols-2 gap-3 border-t border-border-subtle pt-3">
        <div>
          <div className="text-caption1 text-muted-foreground">有氧漂移</div>
          <div className="num text-title3 font-semibold text-text-primary">
            {decouplingPct != null ? `${decouplingPct.toFixed(1)}%` : NO_VALUE}
          </div>
        </div>
        <div>
          <div className="text-caption1 text-muted-foreground">效率 EF</div>
          <div className="num text-title3 font-semibold text-text-primary">
            {efficiencyFactor != null ? efficiencyFactor.toFixed(2) : NO_VALUE}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 横轴：整段用时均分五格，指针所在时刻加重显示 */
function TimeAxis({
  domain,
  hoverTimeSec,
}: {
  domain: { start: number; end: number };
  hoverTimeSec: number | null;
}) {
  const ticks = Array.from({ length: TICK_COUNT }, (_, index) => {
    const ratio = index / (TICK_COUNT - 1);
    return { key: index, seconds: ratio * (domain.end - domain.start) };
  });
  const hoverRatio =
    hoverTimeSec != null ? (hoverTimeSec - domain.start) / (domain.end - domain.start) : null;
  const elapsed = hoverTimeSec != null ? hoverTimeSec - domain.start : null;

  return (
    <div className="pl-2 pr-2">
      <div className="relative flex justify-between text-caption2 text-muted-foreground">
        {ticks.map((tick) => (
          <span key={tick.key} className="num">
            {formatElapsed(tick.seconds)}
          </span>
        ))}
        {hoverRatio != null ? (
          <span
            className="num absolute -top-5 -translate-x-1/2 rounded-full bg-primary px-1.5 py-0.5 text-caption2 text-primary-foreground"
            style={{ left: `${Math.min(0.96, Math.max(0.04, hoverRatio)) * 100}%` }}
          >
            {formatElapsed(elapsed ?? 0)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
