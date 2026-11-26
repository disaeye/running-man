"use client";

import { useEffect, useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import { normalizeGpsTrack } from "@features/activity/lib/gps-track";
import { simplifyTrack, cumulativeDistancesKm } from "@features/activity/lib/gps-simplify";
import { fitZoom, geoBounds, lonLatToWorldPixel, tileZoomScale } from "@features/activity/lib/gps-mercator";
import { joinTrackSamples } from "@features/activity/components/map/map-data";
import { TileLayer } from "@features/activity/components/map/TileLayer";
import { RouteOverlay } from "@features/activity/components/map/RouteOverlay";
import { TrackMeters } from "@features/activity/components/map/TrackMeters";
import { useElementSize } from "@features/activity/components/map/useElementSize";
import { useTrackPlayback } from "@features/activity/components/map/useTrackPlayback";
import { GpsTrack } from "@features/activity/components/GpsTrack";
import type { StreamMap } from "@shared/types/activity";

interface ActivityMapProps {
  streams: StreamMap;
  /** 运动流图表悬停的时间点（秒），在地图上显示游标 */
  hoverTimeSec?: number | null;
}

const MAP_HEIGHT = 300;
const FIT_PAD = 16;

export function ActivityMap({ streams, hoverTimeSec = null }: ActivityMapProps) {
  const [tilesFailed, setTilesFailed] = useState(false);
  const { ref, size } = useElementSize<HTMLDivElement>();
  const playback = useTrackPlayback();

  useEffect(() => {
    if (hoverTimeSec != null && playback.playing) {
      playback.pause();
    }
  }, [hoverTimeSec, playback]);

  const samples = useMemo(
    () => joinTrackSamples(simplifyTrack(normalizeGpsTrack(streams).points), streams),
    [streams],
  );

  const view = useMemo(() => {
    if (!size || samples.length < 2) return null;
    const bounds = geoBounds(samples.map((s) => s.point));
    if (!bounds) return null;
    const zoom = fitZoom(bounds, size.width, MAP_HEIGHT, FIT_PAD);
    const { tileZoom, scale } = tileZoomScale(zoom);
    const topLeft = lonLatToWorldPixel(bounds.minLon, bounds.maxLat, zoom);
    const bottomRight = lonLatToWorldPixel(bounds.maxLon, bounds.minLat, zoom);
    const originX = (topLeft.x + bottomRight.x) / 2 - size.width / 2;
    const originY = (topLeft.y + bottomRight.y) / 2 - MAP_HEIGHT / 2;
    const px = samples.map((s) => {
      const world = lonLatToWorldPixel(s.point.lon, s.point.lat, zoom);
      return { x: world.x - originX, y: world.y - originY };
    });
    return { zoom, tileZoom, scale, originX, originY, px };
  }, [samples, size]);

  const cumKm = useMemo(() => cumulativeDistancesKm(samples.map((s) => s.point)), [samples]);

  if (samples.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl bg-secondary/40 text-caption1 text-muted-foreground">
        暂无 GPS 数据
      </div>
    );
  }

  if (tilesFailed) {
    return <GpsTrack streams={streams} hoverTimeSec={hoverTimeSec} />;
  }

  const lastIdx = samples.length - 1;
  const headIdx = view ? Math.min(lastIdx, Math.round(playback.progress * lastIdx)) : 0;
  const hoverIdx = findNearestIndex(samples, hoverTimeSec);
  const totalKm = cumKm[lastIdx] ?? 0;

  return (
    <div className="flex flex-col gap-2 sm:flex-row" data-testid="gps-map">
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-border-subtle bg-secondary/20">
        <div
          ref={ref}
          role="button"
          tabIndex={0}
          aria-label={playback.playing ? "暂停轨迹回放" : "继续轨迹回放"}
          onClick={playback.toggle}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              playback.toggle();
            }
          }}
          className="relative block h-[300px] w-full cursor-pointer"
        >
          {view ? (
            <>
              <TileLayer
                zoom={view.tileZoom}
                scale={view.scale}
                originX={view.originX}
                originY={view.originY}
                width={Math.ceil(size?.width ?? 0)}
                height={MAP_HEIGHT}
                onTileError={() => setTilesFailed(true)}
              />
              <RouteOverlay
                samples={samples}
                px={view.px}
                width={size?.width ?? 0}
                height={MAP_HEIGHT}
                headIdx={headIdx}
                hoverIdx={hoverIdx}
              />
              <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-full border border-border-default bg-surface-card/95 px-2.5 py-1 text-caption1 text-muted-foreground">
                {playback.playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                <span className="num" data-testid="map-progress">
                  {(cumKm[headIdx] ?? 0).toFixed(2)} / {totalKm.toFixed(2)} km
                </span>
              </div>
              <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-2 rounded-full border border-border-default bg-surface-card/95 px-2.5 py-1 text-caption1 text-muted-foreground">
                <span>慢</span>
                <span className="h-1.5 w-10 rounded-full bg-gradient-to-r from-[var(--color-destructive)] via-[var(--color-warning)] to-[var(--color-success)]" aria-hidden />
                <span>快</span>
              </div>
            </>
          ) : (
            <div className="h-full w-full animate-pulse bg-secondary/30" />
          )}
        </div>
      </div>

      {view ? (
        <TrackMeters samples={samples} headIdx={headIdx} hoverIdx={hoverIdx} />
      ) : (
        <div className="hidden shrink-0 sm:block sm:w-[132px]" />
      )}
    </div>
  );
}

function findNearestIndex(samples: readonly { timeSec: number }[], targetSec: number | null): number | null {
  if (targetSec == null || samples.length === 0) return null;
  let best = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < samples.length; i += 1) {
    const delta = Math.abs(samples[i]!.timeSec - targetSec);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  return bestDelta <= 30 ? best : null;
}
