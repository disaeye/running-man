"use client";

import { groupStreams, type ActivityDetail } from "@shared/types/activity";
import { PageCard, Stat } from "@shared/ui/Lovable";
import { getSportConfig } from "@shared/config/sport-config";
import { useActivityDetail } from "@features/activity/hooks/useActivityDetail";
import { useActivityStreams } from "@features/activity/hooks/useActivityStreams";
import { useActivityAnalysis } from "@features/activity/hooks/useActivityAnalysis";
import { MultiStreamChart } from "@features/activity/components/MultiStreamChart";
import { GpsSection } from "@features/activity/components/GpsSection";
import { resolveGpsState } from "@features/activity/lib/activity-detail";
import { StrengthDetail } from "@features/activity/components/StrengthDetail";
import { DemoSplitTable } from "@features/activity/components/DemoSplitTable";
import { formatDuration, formatPaceFromSeconds } from "@shared/lib/format";

export function DemoActivityReport({ activityId }: { activityId: string }) {
  const query = useActivityDetail(activityId);
  if (query.loading) return <p role="status" className="text-sm text-muted-foreground">正在加载这次训练…</p>;
  if (!query.data) return <PageCard><p className="text-sm text-muted-foreground">还没有可回顾的训练记录</p></PageCard>;
  if (getSportConfig(query.data.sport).isStrength) return <StrengthDetail activityId={activityId} />;
  return <EnduranceReport activityId={activityId} activity={query.data} />;
}

function EnduranceReport({ activityId, activity }: { activityId: string; activity: ActivityDetail }) {
  const streamsQuery = useActivityStreams(activityId);
  const analysisQuery = useActivityAnalysis(activityId);
  const streams = groupStreams(streamsQuery.data);
  const analysis = analysisQuery.data;
  const pace = activity.avg_speed && activity.avg_speed > 0 ? 1000 / activity.avg_speed : null;
  const zones = analysis?.zone_residence ?? [];
  const maxZone = Math.max(1, ...zones.map((zone) => zone.seconds));
  return <div className="space-y-4" data-testid="demo-activity-report">
    <PageCard><div className="grid grid-cols-3 gap-y-3"><Stat label="距离" value={((activity.distance_m ?? 0) / 1000).toFixed(2)} unit="km" /><Stat label="用时" value={formatDuration(activity.duration_s ?? 0)} /><Stat label="配速" value={pace ? formatPaceFromSeconds(Math.round(pace)) : "—"} /></div><div className="mt-3 grid grid-cols-3 gap-y-3 border-t border-border pt-3"><Stat label="GAP" value="—" /><Stat label="爬升" value={activity.elevation_gain_m ?? "—"} unit="m" /><Stat label="卡路里" value={activity.calories ?? "—"} /></div></PageCard>
    <div className="grid grid-cols-3 gap-2"><Stat label="平均心率" value={activity.avg_hr ?? "—"} /><Stat label="最大心率" value={activity.max_hr ?? "—"} /><Stat label="步频" value={activity.avg_cadence ?? "—"} unit="spm" /><Stat label="主观感受 RPE" value={activity.rpe ?? "—"} /><Stat label="训练负荷 rTSS" value={activity.tss?.toFixed(1) ?? "—"} /><Stat label="TRIMP" value={activity.trimp?.toFixed(1)} /><Stat label="强度系数 IF" value={analysis?.summary?.if_val?.toFixed(2) ?? "—"} /><Stat label="效率 EF" value={analysis?.summary?.if_val != null && pace != null && analysis.summary.if_val > 0 ? (1000 / pace * analysis.summary.if_val).toFixed(2) : "—"} /><Stat label="功率" value="未记录" /></div>
    <PageCard title="路线 · 海拔 · 心率"><GpsSection gpsState={resolveGpsState(activity, streams)} streamMap={streams} /><MultiStreamChart streams={streams} /></PageCard>
    <DemoSplitTable laps={analysis?.laps ?? []} fastestLapIndex={analysis?.fastest_lap_index ?? null} />
    <PageCard title="心率区间分布" action={analysis?.dominant_zone ? <span className="text-xs text-muted-foreground">主要 {analysis.dominant_zone}</span> : null}>{zones.length ? <div className="space-y-2">{zones.map((zone) => <div key={zone.zone} className="flex items-center gap-2 text-xs"><span className="w-20">Z{zone.zone}</span><div className="h-2 flex-1 rounded-full bg-secondary"><div className={`h-full rounded-full bg-z${zone.zone}`} style={{ width: `${zone.seconds / maxZone * 100}%` }} /></div><span className="num w-10 text-right">{Math.round(zone.seconds / 60)}m</span></div>)}</div> : <p className="text-sm text-muted-foreground">暂无区间数据</p>}</PageCard>
    <PageCard title="装备与备注"><p className="text-sm text-muted-foreground">{activity.rpe != null ? `主观感受 RPE ${activity.rpe}` : "未添加备注"}</p></PageCard>
  </div>;
}
