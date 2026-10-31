import Link from "next/link";
import { Tag } from "@shared/ui/Lovable";
import { getSportConfig } from "@shared/config/sport-config";
import { formatDuration, formatPaceFromSeconds } from "@shared/lib/format";
import type { ActivitySummary } from "@shared/types/activity";
import { activityLocalDay } from "@shared/lib/training-day";

export function TrainingActivityList({ activities, timezone }: { activities: ActivitySummary[]; timezone: string }) {
  return <div className="space-y-1">{activities.map((activity) => <Link key={activity.activity_id} href={`/activities/${activity.activity_id}`} className="flex items-center gap-3 rounded-xl p-3 hover:bg-secondary/60"><div className="num w-12 text-xs text-muted-foreground">{activityLocalDay(activity.start_time, timezone).slice(5)}</div><div className="flex-1"><div className="flex items-center gap-2"><Tag tone="primary">{getSportConfig(activity.sport).label}</Tag>{activity.is_race ? <Tag>比赛</Tag> : null}<span className="text-sm font-medium">{activity.name?.trim() || getSportConfig(activity.sport).label}</span></div><div className="num mt-1 flex gap-3 text-xs text-muted-foreground">{activity.distance_m != null ? <span>{(activity.distance_m / 1000).toFixed(2)} km</span> : null}<span>{formatDuration(activity.duration_s ?? 0)}</span>{activity.avg_speed ? <span>{formatPaceFromSeconds(Math.round(1000 / activity.avg_speed))}/km</span> : null}</div></div><span className="num text-xs text-muted-foreground">TSS {Math.round(activity.tss ?? 0)}</span></Link>)}</div>;
}
