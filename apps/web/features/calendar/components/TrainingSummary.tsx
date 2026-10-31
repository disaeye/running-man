import { Stat } from "@shared/ui/Lovable";
import type { ActivitySummary } from "@shared/types/activity";
import { formatDuration } from "@shared/lib/format";

export function TrainingSummary({ activities }: { activities: ActivitySummary[] }) {
  const distance = activities.reduce((sum, activity) => sum + (activity.distance_m ?? 0), 0) / 1000;
  const duration = activities.reduce((sum, activity) => sum + (activity.duration_s ?? 0), 0);
  const tss = activities.reduce((sum, activity) => sum + (activity.tss ?? 0), 0);
  return <div className="grid grid-cols-4 gap-2"><Stat label="次数" value={activities.length} /><Stat label="跑量" value={distance.toFixed(1)} unit="km" /><Stat label="时长" value={formatDuration(duration)} /><Stat label="总 TSS" value={Math.round(tss)} /></div>;
}
