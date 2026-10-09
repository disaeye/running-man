import type { StreamMap } from "@shared/types/activity";
import { Card } from "@shared/ui/Card";
import { GpsTrack } from "@features/activity/components/GpsTrack";
import { ColoredGpsTrack } from "@features/activity/components/ColoredGpsTrack";
import type { GpsUiState } from "@features/activity/lib/activity-detail";

export function GpsSection({ gpsState, streamMap }: { gpsState: GpsUiState; streamMap: StreamMap }) {
  switch (gpsState) {
    case "valid":
      return (
        <div className="grid gap-6 lg:grid-cols-2">
          <GpsTrack streams={streamMap} />
          <ColoredGpsTrack streams={streamMap} />
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
