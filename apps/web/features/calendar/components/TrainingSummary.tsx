import { Stat } from "@shared/ui/Lovable";
import type { ActivitySummary } from "@shared/types/activity";

export function TrainingSummary({ activities }: { activities: ActivitySummary[] }) {
  const distance = activities.filter((activity) => ["Run", "VirtualRun", "TrailRun"].includes(activity.sport)).reduce((sum, activity) => sum + (activity.distance_m ?? 0), 0) / 1000;
  const elevation = activities.reduce((sum, activity) => sum + (activity.elevation_gain_m ?? 0), 0);
  const tss = activities.reduce((sum, activity) => sum + (activity.tss ?? 0), 0);
  return <div className="grid grid-cols-4 gap-2"><Stat label="次数" value={activities.length} /><Stat label="距离" value={distance.toFixed(1)} unit="km" /><Stat label="爬升" value={Math.round(elevation)} unit="m" /><Stat label="TSS" value={Math.round(tss)} /></div>;
}
