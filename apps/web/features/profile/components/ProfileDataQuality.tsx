"use client";

import Link from "next/link";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@shared/ui/button";
import { useDataQuality } from "@features/data/hooks/useDataQuality";
import { NO_VALUE } from "@shared/lib/use-data-state";

function formatMonth(value: string | null | undefined): string {
  if (!value) return NO_VALUE;
  const month = value.slice(0, 7);
  return `${month.slice(0, 4)}/${month.slice(5, 7)}`;
}

/**
 * 「我的」页的数据质量摘要。
 *
 * 覆盖范围说明数据从哪一天开始，四行计数说明缺什么，问题列表说明后端规则
 * 检出了哪些异常。三段信息都来自 /data/quality 的同一份响应。
 */
export function ProfileDataQuality() {
  const { data, loading, error, reload } = useDataQuality();

  if (loading) return <p className="text-caption1 text-muted-foreground">正在检查数据…</p>;
  if (error || !data) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="alert" className="text-caption1 text-destructive">{error ?? "数据质量暂不可用"}</p>
        <Button type="button" variant="outline" size="sm" onClick={reload}>
          <RefreshCw className="size-3.5" aria-hidden /> 重试
        </Button>
      </div>
    );
  }

  const activities = data.coverage.activities;
  const wellness = data.coverage.wellness;
  const uploads = data.coverage.uploads;
  const total = activities.total_activities;

  const counters = [
    { label: "跑步缺失心率流", value: total - activities.with_hr, total },
    { label: "缺失配速 / GPS", value: total - activities.with_gps, total },
    { label: "缺失时序流数据", value: total - activities.with_streams, total },
    { label: "近 28 天睡眠 / 静息心率 / HRV", value: `${wellness.sleep_days_28d}/${wellness.rhr_days_28d}/${wellness.hrv_days_28d ?? 0}`, total: "28天" },
    {
      label: "近 30 天未关联跑鞋",
      value: activities.unassigned_run_activities_30d,
      total: null,
    },
    { label: "同步失败条目", value: uploads?.failed_30d ?? 0, total: null },
  ];

  return (
    <div className="space-y-3">
      <p className="text-caption1 text-muted-foreground">
        覆盖范围：活动 {formatMonth(activities.first_at)} 起 · 健康数据 {formatMonth(wellness.first_day)} 起
      </p>
      <div className="divide-y divide-border">
        {counters.map((counter) => (
          <div key={counter.label} className="flex items-center justify-between gap-2 py-2 text-subheadline">
            <span className="text-muted-foreground">{counter.label}</span>
            <span className="num font-mono text-base tabular-nums">
              {counter.value}
              {counter.total == null ? "" : ` / ${counter.total}`}
            </span>
          </div>
        ))}
      </div>
      {data.issues.length ? (
        <ul className="space-y-2">
          {data.issues.map((issue) => (
            <li key={issue.key} className="flex items-start gap-2 rounded-lg bg-secondary p-2.5 text-caption1">
              <AlertCircle
                className={`mt-0.5 h-4 w-4 shrink-0 ${issue.severity === "error" ? "text-error" : "text-warn"}`}
                aria-hidden
              />
              <span>
                {issue.label}
                {issue.count != null && issue.count > 0 ? `（${issue.count} 条）` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption1 text-muted-foreground">当前检查未发现异常</p>
      )}
      <Link
        href="/settings?section=data"
        className="inline-flex min-h-11 items-center text-caption1 font-medium text-accent-strong hover:underline"
      >
        前往数据设置处理 →
      </Link>
    </div>
  );
}
