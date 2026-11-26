"use client";

import Link from "next/link";
import useSWR from "swr";
import { ChevronRight } from "lucide-react";
import { PageCard } from "@shared/ui/Card";
import { LovableChart } from "@shared/ui/LovableChart";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { physiologyApiV1AthletesMePhysiologyGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { useProfile } from "@features/settings/hooks/useProfile";
import { formatPace } from "@features/today/hooks/useAbility";
import { useThresholdHistory } from "@features/settings/hooks/useThresholdHistory";
import { useActivities } from "@features/activity/hooks/useActivities";
import { buildEfAnnotations } from "@features/analysis/lib/chart-annotations";
import { useCurrentReadings } from "@features/health/lib/physiology-display";
import { getSportConfig } from "@shared/config/sport-config";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { formatPaceFromSeconds } from "@shared/lib/format";

export function AnalysisPerformance({ from, to }: { from: string; to: string }) {
  const { profile } = useProfile();
  const { entries } = useThresholdHistory();
  const activitiesQuery = useActivities(from, to);
  const activities = activitiesQuery.data;
  const vo2max = useCurrentReadings().vo2max;
  const physiology = useSWR("/athletes/me/physiology", {
    fetcher: () => callOrvalValidated((f) => physiologyApiV1AthletesMePhysiologyGet({}, f), Generated.PhysiologyResponse),
  });
  const insufficient = physiology.data != null && physiology.data.data_sufficient === false;

  const runActivities = activities.filter((activity) => getSportConfig(activity.sport).isRun);
  const efPoints = runActivities
    .map((activity) => ({
      day: activity.start_time.slice(0, 10),
      activityId: activity.activity_id,
      name: activity.name?.trim() || getSportConfig(activity.sport).label,
      isRace: Boolean(activity.is_race),
      value:
        activity.avg_speed != null && activity.avg_speed > 0 && activity.avg_hr != null && activity.avg_hr > 0
          ? (activity.avg_speed * 60) / activity.avg_hr
          : null,
    }))
    .filter(
      (point): point is { day: string; activityId: string; name: string; isRace: boolean; value: number } =>
        point.value != null,
    )
    .reverse();
  const efAnnotations = buildEfAnnotations(efPoints);

  const latestLthrSource = entries.findLast((e) => e.lthr != null)?.source;
  const latestPaceSource = entries.findLast((e) => e.threshold_pace != null)?.source;
  const lthrValue = profile?.lthr ?? null;
  const paceValue = profile?.threshold_pace ?? null;

  const metrics = [
    {
      label: "最大摄氧量",
      value: vo2max != null ? vo2max.value.toFixed(1) : insufficient ? "样本不足" : NO_VALUE,
      unit: vo2max != null ? "ml/kg/min" : "",
      source: vo2max != null ? "设备" : insufficient ? "估算" : "未记录",
      note: vo2max != null
        ? `记录于 ${vo2max.day} · 设备同步`
        : insufficient
          ? "最大强度课样本还不够，跑几次全力课后才会给出读数"
          : "设备未同步最大摄氧量",
    },
    {
      label: "乳酸阈心率 LTHR",
      value: lthrValue != null ? lthrValue : insufficient ? "样本不足" : NO_VALUE,
      unit: lthrValue != null ? "bpm" : "",
      source: latestLthrSource === "manual" ? "设置" : lthrValue != null ? "估算" : "未记录",
      note: lthrValue != null
        ? latestLthrSource === "manual" ? "来自个人阈值设置" : "由阈值课表现反推"
        : insufficient
          ? "需要更多阈值课样本，或在设置页手动录入"
          : "可在设置页填写或通过阈值课估算",
    },
    {
      label: "阈值配速",
      value: paceValue != null ? formatPace(paceValue) : insufficient ? "样本不足" : NO_VALUE,
      unit: paceValue != null ? "/km" : "",
      source: latestPaceSource === "manual" ? "设置" : paceValue != null ? "估算" : "未记录",
      note: paceValue != null
        ? latestPaceSource === "manual" ? "来自个人阈值设置" : "由长距离与阈值课样本反推"
        : insufficient
          ? "需要更多阈值课样本，或在设置页手动录入"
          : "可在设置页填写或通过阈值课估算",
    },
    {
      label: "最大心率 HRmax",
      value: profile?.hr_max ?? NO_VALUE,
      unit: profile?.hr_max != null ? "bpm" : "",
      source: profile?.hr_max != null ? "设置" : "未记录",
      note: "按设置值或年龄估算",
    },
  ];

  const paces = entries.filter((entry) => {
    if (entry.threshold_pace == null) return false;
    const day = entry.effective_from.slice(0, 10);
    return (!from || day >= from) && (!to || day <= to);
  });
  const supporting = runActivities
    .filter((activity) => activity.avg_speed != null && activity.avg_speed > 0)
    .slice(0, 4);

  return (
    <div className="space-y-4" data-testid="analysis-performance">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric, idx) => {
          const borderAccent =
            idx === 0 ? "border-l-fitness" : idx === 1 ? "border-l-fatigue" : idx === 2 ? "border-l-accent-strong" : "border-l-form";
          return (
            <div key={metric.label} className={`surface card-spotlight border-l-2 ${borderAccent} p-3.5`}>
              <div className="flex items-center justify-between gap-2 text-caption1 text-muted-foreground">
                <span>{metric.label}</span>
                <span className="rounded-full bg-surface-sunken/70 px-2 py-0.5 text-caption1">{metric.source}</span>
              </div>
              <div className="num mt-1.5 text-3xl font-bold tabular-nums">
                {metric.value}
                {metric.unit ? <span className="ml-1 text-caption1 font-normal text-muted-foreground">{metric.unit}</span> : null}
              </div>
              <div className="mt-1 text-caption1 text-muted-foreground">{metric.note}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-7">
          <PageCard title="阈值配速趋势">
            {paces.length > 1 ? (
              <>
                <div className="mb-2 flex justify-between text-sm">
                  <span>期初 <span className="num">{formatPace(paces[0]?.threshold_pace)}</span></span>
                  <span className="text-accent-strong">最新 <span className="num">{formatPace(paces.at(-1)?.threshold_pace)}</span>/km</span>
                </div>
                <LovableChart
                  h={120}
                  invertY
                  labels={paces.map((entry) => entry.effective_from.slice(5, 10))}
                  lines={[{ data: paces.map((entry) => entry.threshold_pace ?? null), cls: "stroke-accent-strong", label: "阈值配速", format: (v) => formatPaceFromSeconds(Math.round(v)) }]}
                />
              </>
            ) : (
              <p className="text-caption1 text-text-muted">该时段内阈值配速变化记录不足 2 条，更新或估算阈值后将在此形成趋势。</p>
            )}
            <div className="mt-3 text-xs text-muted-foreground">近期跑步参考活动</div>
            {activitiesQuery.loading ? (
              <p className="mt-2 text-sm text-muted-foreground" role="status">正在加载近期跑步记录…</p>
            ) : activitiesQuery.error ? (
              <p className="mt-2 text-sm text-error" role="alert">跑步记录加载失败：{activitiesQuery.error}</p>
            ) : supporting.length ? (
              <div className="mt-2 space-y-2">
                {supporting.map((activity) => (
                  <Link key={activity.activity_id} href={`/activities/${activity.activity_id}`} className="flex items-center justify-between rounded-lg bg-secondary p-2.5 text-sm hover:bg-surface-active">
                    <span className="truncate">{activity.name?.trim() || getSportConfig(activity.sport).label} · {activity.start_time.slice(0, 10)}</span>
                    <span className="num flex shrink-0 items-center gap-1 text-muted-foreground">
                      {formatPaceFromSeconds(Math.round(1000 / (activity.avg_speed ?? 1)))}/km
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">所选时间范围内没有可用的跑步活动</p>
            )}
          </PageCard>
        </div>

        <div className="lg:col-span-5">
          <PageCard title="效率系数 EF">
            <LovableChart
              h={90}
              labels={efPoints.map((point) => point.day.slice(5))}
              annotations={efAnnotations}
              lines={[{ data: efPoints.map((point) => point.value ?? null), cls: "stroke-fitness", label: "EF", format: (v) => `${v.toFixed(2)} m/beat` }]}
              emptyMessage="所选范围内暂无同时包含配速和心率的跑步记录"
            />

          </PageCard>
        </div>
      </div>
    </div>
  );
}
