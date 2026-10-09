"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@shared/ui/Card";
import { ListPager } from "@shared/ui/ListPager";
import { formatDistance, formatDuration, formatDate } from "@shared/lib/format";
import type { ActivitySummary } from "@shared/types/activity";
import { getSportConfig } from "@shared/config/sport-config";

const PAGE_SIZE = 20;

interface ActivityTableProps {
  activities: ActivitySummary[];
  loading: boolean;
  error: string | null;
}

export function ActivityTable({ activities, loading, error }: ActivityTableProps) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(activities.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = activities.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const openActivity = (activityId: string) => router.push(`/activities/${activityId}`);

  return (
    <Card padding="none" id="activities" data-testid="activity-table">
      <div className="border-b border-border-subtle px-4 py-3 sm:px-6"><h2 className="text-callout font-semibold text-text-primary sm:text-headline">活动记录</h2></div>
      {error && <div className="px-6 py-12 text-center text-subheadline text-error">{error}</div>}
      {loading && !error && <div className="px-6 py-12 text-center text-subheadline text-text-muted">加载中...</div>}
      {!loading && !error && activities.length === 0 && <div className="px-6 py-12 text-center text-subheadline text-text-muted">所选范围内暂无活动记录</div>}
      {!loading && !error && activities.length > 0 && <>
        <div className="hidden overflow-x-auto sm:block"><table className="w-full text-subheadline"><thead><tr className="border-b border-border-subtle text-left text-caption1 font-medium uppercase tracking-wider text-text-muted"><th className="px-6 py-3">日期</th><th className="px-6 py-3">类型</th><th className="px-6 py-3 text-right">距离</th><th className="px-6 py-3 text-right">时长</th><th className="px-6 py-3 text-right">心率</th><th className="px-6 py-3 text-right">TSS</th><th className="px-6 py-3 text-right">NP</th></tr></thead><tbody>{pageData.map((activity) => <tr key={activity.activity_id} onClick={() => openActivity(activity.activity_id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openActivity(activity.activity_id); } }} tabIndex={0} role="link" className="cursor-pointer border-b border-border-subtle/50 transition-colors last:border-b-0 hover:bg-surface-overlay focus-ring"><td className="px-6 py-3 font-mono text-text-primary">{formatDate(activity.start_time)}</td><td className="px-6 py-3 text-text-secondary">{getSportConfig(activity.sport).label}</td><td className="px-6 py-3 text-right font-mono text-text-primary">{formatDistance(activity.distance_m)}</td><td className="px-6 py-3 text-right font-mono text-text-primary">{formatDuration(activity.duration_s)}</td><td className="px-6 py-3 text-right font-mono text-text-primary">{activity.avg_hr != null ? activity.avg_hr : "--"}</td><td className="px-6 py-3 text-right font-mono text-text-primary">{activity.tss != null ? Math.round(activity.tss) : "--"}</td><td className="px-6 py-3 text-right font-mono text-text-primary">{activity.np != null ? Math.round(activity.np) : "--"}</td></tr>)}</tbody></table></div>
        <div className="flex flex-col gap-2 p-3 sm:hidden">{pageData.map((activity) => <button key={activity.activity_id} type="button" onClick={() => openActivity(activity.activity_id)} className="min-h-[48px] w-full rounded-md border border-border-subtle bg-surface-overlay p-3 text-left transition-colors active:bg-surface-active"><div className="flex items-center justify-between"><span className="font-mono text-subheadline font-medium text-text-primary">{formatDate(activity.start_time)}</span><span className="text-caption1 text-text-secondary">{getSportConfig(activity.sport).label}</span></div><div className="mt-1.5 flex items-center gap-3 text-caption1 text-text-muted"><span>{formatDistance(activity.distance_m)}</span><span>{formatDuration(activity.duration_s)}</span>{activity.avg_hr != null && <span>HR {activity.avg_hr}</span>}{activity.tss != null && <span>TSS {Math.round(activity.tss)}</span>}</div></button>)}</div>
        <ListPager page={safePage} totalPages={totalPages} totalItems={activities.length} onPageChange={setPage} />
      </>}
    </Card>
  );
}
