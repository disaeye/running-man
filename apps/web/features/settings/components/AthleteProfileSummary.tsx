"use client";

import { Activity, Flame, Gauge, Heart, ShieldCheck, ShieldAlert, User } from "lucide-react";
import type { UserProfile } from "@shared/lib/auth";
import { formatPace } from "@shared/lib/format";

interface Props {
  profile: UserProfile | null;
  loading?: boolean;
}

/**
 * Athlete profile header with the four thresholds the zone maths depends on.
 *
 * Two things this deliberately does not do:
 *
 * - It does not substitute default thresholds when the profile is missing or a
 *   field is empty. It used to render "耐力跑者 / RHR 48 / LTHR 168 / HRmax 188 /
 *   4'20\"/km" from a hard-coded object whenever the fetch failed, and fall back
 *   to the same numbers for any field left blank. Those values look like a real
 *   assessment, and they flow into zone boundaries, TSS, and training advice.
 * - It does not claim the baseline is confirmed when it is not. "基准已确认"
 *   was shown unconditionally, next to those invented numbers. The badge now
 *   reflects how many of the four thresholds are actually recorded.
 */
export function AthleteProfileSummary({ profile }: Props) {
  const recorded = [
    profile?.hr_max,
    profile?.resting_hr,
    profile?.lthr,
    profile?.threshold_pace,
  ].filter((value) => value != null).length;

  const birthYear = profile?.dob ? new Date(profile.dob).getFullYear() : null;
  const age = birthYear === null ? null : Math.max(0, new Date().getFullYear() - birthYear);

  const metrics = [
    {
      label: "静息心率 (RHR)",
      value: profile?.resting_hr != null ? `${profile.resting_hr}` : "——",
      unit: profile?.resting_hr != null ? "bpm" : "",
      note: "夜间基线水平",
      Icon: Heart,
      color: "text-pink",
    },
    {
      label: "阈值心率 (LTHR)",
      value: profile?.lthr != null ? `${profile.lthr}` : "——",
      unit: profile?.lthr != null ? "bpm" : "",
      note: "心率分区与 hrTSS 的基准",
      Icon: Flame,
      color: "text-warning",
    },
    {
      label: "阈值配速 (TP)",
      value: profile?.threshold_pace != null ? formatPace(profile.threshold_pace) : "——",
      unit: profile?.threshold_pace != null ? "/km" : "",
      note: "一小时全力配速",
      Icon: Gauge,
      color: "text-info",
    },
    {
      label: "最大心率 (Max HR)",
      value: profile?.hr_max != null ? `${profile.hr_max}` : "——",
      unit: profile?.hr_max != null ? "bpm" : "",
      note: "心率安全上限",
      Icon: Activity,
      color: "text-atl",
    },
  ] as const;

  const identity = [
    profile?.email,
    profile?.sex ? (profile.sex === "male" ? "男" : "女") : null,
    age !== null ? `${age} 岁` : null,
    profile?.timezone,
  ].filter(Boolean) as string[];

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-card/55 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle pb-5">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
            <User className="size-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-title3 font-semibold text-text-primary">
                {profile?.name || (profile ? "未命名运动员" : "档案未加载")}
              </h2>
              {recorded === 4 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-caption2 font-medium text-success">
                  <ShieldCheck className="size-3" aria-hidden="true" />基准已确认
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-caption2 font-medium text-warning">
                  <ShieldAlert className="size-3" aria-hidden="true" />
                  {recorded === 0 ? "尚未填写阈值" : `已填写 ${recorded}/4 项阈值`}
                </span>
              )}
            </div>
            {identity.length > 0 ? (
              <p className="mt-1 text-caption1 text-text-muted">{identity.join(" · ")}</p>
            ) : (
              <p className="mt-1 text-caption1 text-text-muted">
                {profile ? "尚未填写个人资料" : "无法读取档案，请检查登录状态或后端服务"}
              </p>
            )}
          </div>
        </div>
        {profile?.preferred_sport && (
          <span className="flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-caption1 font-semibold text-primary">
            <Activity className="size-3.5" aria-hidden="true" />
            {profile.preferred_sport === "cycling" ? "骑行" : "跑步"}
          </span>
        )}
      </div>

      {recorded < 4 && (
        <p className="mt-4 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-caption1 text-warning">
          缺少的阈值会让对应的心率分区、负荷计算与训练建议不可用。可在下方「训练参数」中填写，或连接数据源后使用自动估算。
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-default bg-border-default sm:grid-cols-4">
        {metrics.map(({ label, value, unit, note, Icon, color }) => (
          <div key={label} className="bg-surface-card p-4">
            <div className="flex items-center gap-1.5 text-caption1 text-text-muted">
              <Icon className={`size-3.5 ${color}`} aria-hidden="true" />
              <span>{label}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className={`font-mono text-xl ${value === "——" ? "text-text-muted" : "text-text-primary"}`}>
                {value}
              </span>
              {unit && <span className="text-caption1 text-text-muted">{unit}</span>}
            </div>
            <p className="mt-1 text-caption1 text-text-muted">{note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
