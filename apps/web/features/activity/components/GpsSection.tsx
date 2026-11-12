import type { StreamMap } from "@shared/types/activity";
import { Card } from "@shared/ui/Card";
import { ActivityMap } from "@features/activity/components/map/ActivityMap";
import type { GpsUiState } from "@features/activity/lib/activity-detail";

export function GpsSection({ gpsState, streamMap, hoverTimeSec = null }: {
  gpsState: GpsUiState;
  streamMap: StreamMap;
  hoverTimeSec?: number | null;
}) {
  switch (gpsState) {
    case "valid":
      return (
        <div data-testid="gps-valid-state">
          <ActivityMap streams={streamMap} hoverTimeSec={hoverTimeSec} />
        </div>
      );
    case "partial":
      return (
        <Card padding="sm" data-testid="gps-partial-state">
          <p className="text-caption1 text-text-muted">GPS 轨迹不完整，无法绘制路线</p>
        </Card>
      );
    case "empty":
      return (
        <Card padding="sm" data-testid="gps-empty-state">
          <p className="text-caption1 text-text-muted">此活动无 GPS 数据</p>
        </Card>
      );
  }
}
