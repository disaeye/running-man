"use client";

import { groupStreams, type ActivityDetail } from "@shared/types/activity";
import { PageCard, Stat, Tag } from "@shared/ui/Lovable";
import { getSportConfig } from "@shared/config/sport-config";
import { useActivityDetail } from "@features/activity/hooks/useActivityDetail";
import { useActivityStreams } from "@features/activity/hooks/useActivityStreams";
import { useActivityAnalysis } from "@features/activity/hooks/useActivityAnalysis";
import { MultiStreamChart } from "@features/activity/components/MultiStreamChart";
import { GpsTrack } from "@features/activity/components/GpsTrack";
import { resolveGpsState } from "@features/activity/lib/activity-detail";
import { StrengthDetail } from "@features/activity/components/StrengthDetail";
import { formatDuration, formatPaceFromSeconds } from "@shared/lib/format";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { useShoeMutations, useShoes } from "@features/activity/hooks/useGear";
import { useState } from "react";

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
  const totalZoneSeconds = Math.max(1, zones.reduce((sum, zone) => sum + zone.seconds, 0));
  const gpsState = resolveGpsState(activity, streams);
  return <div className="space-y-4" data-testid="demo-activity-report">
    <PageCard><div className="grid grid-cols-3 gap-y-4"><Stat label="距离" value={((activity.distance_m ?? 0) / 1000).toFixed(2)} unit="km" /><Stat label="用时" value={formatDuration(activity.duration_s ?? 0)} /><Stat label="配速" value={pace ? formatPaceFromSeconds(Math.round(pace)) : NO_VALUE} /><Stat label="GAP" value={pace && analysis?.summary?.if_val ? formatPaceFromSeconds(Math.round(pace / analysis.summary.if_val)) : NO_VALUE} /><Stat label="爬升" value={activity.elevation_gain_m ?? NO_VALUE} unit="m" /><Stat label="卡路里" value={activity.calories ?? NO_VALUE} /><Stat label="平均心率" value={activity.avg_hr ?? NO_VALUE} /><Stat label="最大心率" value={activity.max_hr ?? NO_VALUE} /><Stat label="步频" value={activity.avg_cadence ?? NO_VALUE} unit="spm" /><Stat label="RPE" value={activity.rpe ?? NO_VALUE} /><Stat label="rTSS" value={activity.tss?.toFixed(1) ?? NO_VALUE} /><Stat label="TRIMP" value={activity.trimp?.toFixed(1) ?? NO_VALUE} /></div></PageCard>
    <div className="flex gap-2 text-caption1 text-muted-foreground"><Tag>{activity.device_name ?? "未知设备"}</Tag><Tag>{activity.source}</Tag><Tag>{activity.is_race ? "比赛" : "普通训练"}</Tag></div>
    {gpsState === "valid" ? <PageCard title="运动轨迹"><GpsTrack streams={streams} /></PageCard> : null}
    <PageCard title="海拔 · 心率"><MultiStreamChart streams={streams} /></PageCard>
    <div className="grid grid-cols-2 gap-3"><PageCard><Stat label="有氧漂移" value={analysis?.summary?.decoupling_pct != null ? `${analysis.summary.decoupling_pct.toFixed(1)}%` : NO_VALUE} /></PageCard><PageCard><Stat label="效率 EF" value={analysis?.summary?.if_val != null && pace != null && analysis.summary.if_val > 0 ? (1000 / pace * analysis.summary.if_val).toFixed(2) : NO_VALUE} /></PageCard></div>
    <PageCard title="分段（每公里）"><SplitRows laps={analysis?.laps ?? []} fastest={analysis?.fastest_lap_index ?? null} /></PageCard>
    <PageCard title="心率区间分布" action={<Tag>活动发生时阈值</Tag>}>{zones.length ? <div className="space-y-2">{zones.map((zone) => <div key={zone.zone} className="flex items-center gap-2 text-xs"><span className="w-8">Z{zone.zone}</span><div className="h-2 flex-1 rounded-full bg-secondary"><div className={`h-full rounded-full bg-z${zone.zone}`} style={{ width: `${zone.seconds / Math.max(...zones.map((item) => item.seconds)) * 100}%` }} /></div><span className="num w-10 text-right">{Math.round(zone.seconds / 60)}m</span><span className="num w-10 text-right text-muted-foreground">{Math.round(zone.seconds / totalZoneSeconds * 100)}%</span></div>)}</div> : <p className="text-sm text-muted-foreground">暂无区间数据</p>}</PageCard>
    <GearCard activityId={activityId} activity={activity} />
  </div>;
}

function SplitRows({ laps, fastest }: { laps: ReturnType<typeof useActivityAnalysis>["data"] extends infer T ? T extends { laps: infer L } ? L : never : never; fastest: number | null }) {
  if (!laps?.length) return <p className="text-sm text-muted-foreground">暂无分段数据</p>;
  const paces = laps.map((lap) => lap.avg_speed && lap.avg_speed > 0 ? 1000 / lap.avg_speed : lap.pace_s_per_km ?? 0);
  const fastestPace = Math.min(...paces.filter((value) => value > 0));
  const slowestPace = Math.max(...paces);
  return <div className="space-y-2">{laps.map((lap, index) => { const lapPace = paces[index] ?? 0; return <div key={lap.lap_index} className="grid grid-cols-[24px_1fr_auto] items-center gap-2 text-xs"><span className={`num ${lap.lap_index === fastest ? "text-accent-strong" : "text-muted-foreground"}`}>{index + 1}</span><div className="flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"><div className={`h-full ${lapPace === fastestPace ? "bg-primary" : lapPace === slowestPace ? "bg-warn" : "bg-fitness"}`} style={{ width: `${lapPace ? Math.min(100, fastestPace / lapPace * 100) : 0}%` }} /></div><span className="num">{lapPace ? formatPaceFromSeconds(Math.round(lapPace)) : NO_VALUE}</span></div><span className="num text-muted-foreground">{lap.avg_hr ?? NO_VALUE} bpm · ↑{lap.elevation_gain ?? 0}m</span></div>; })}</div>;
}

function GearCard({ activityId, activity }: { activityId: string; activity: ActivityDetail }) {
  const shoes = useShoes();
  const mutations = useShoeMutations();
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  async function assign() {
    if (!selected) return;
    const result = await mutations.assign(selected, activityId);
    setMessage(result ? "跑鞋已关联" : "关联失败，请稍后重试");
  }
  return <PageCard title="装备与备注"><div className="flex gap-2"><select value={selected} onChange={(event) => setSelected(event.target.value)} className="min-w-0 flex-1 rounded-lg bg-secondary px-3 py-2 text-sm"><option value="">选择本次使用的跑鞋</option>{shoes.data.filter((shoe) => !shoe.retired_at).map((shoe) => <option key={shoe.shoe_id} value={shoe.shoe_id}>{shoe.name}</option>)}</select><button type="button" onClick={() => void assign()} disabled={!selected} className="rounded-lg bg-primary px-3 text-xs text-primary-foreground disabled:opacity-40">关联</button></div><p className="mt-3 text-sm text-muted-foreground">{activity.avg_stride_length_m ? `平均步幅 ${activity.avg_stride_length_m.toFixed(2)} m` : "暂无步幅记录"} · {activity.rpe != null ? `RPE ${activity.rpe}` : "未记录主观感受"}</p>{message ? <p className="mt-2 text-xs text-accent-strong">{message}</p> : null}</PageCard>;
}
