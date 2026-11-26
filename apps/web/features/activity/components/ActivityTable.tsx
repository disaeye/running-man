"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@shared/ui/Card";
import { ListPager } from "@shared/ui/ListPager";
import { formatDistance, formatDuration, formatDate, formatPace } from "@shared/lib/format";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { ActivitySummary } from "@shared/types/activity";
import type { SessionClassificationItem } from "@features/activity/hooks/useSessionClassifications";
import { activityDetailUrl } from "@shared/config/training-nav";
import { getSportConfig } from "@shared/config/sport-config";
import { useSessionClassifications } from "@features/activity/hooks/useSessionClassifications";
import { activityDisplayName } from "@features/activity/lib/activity-display-name";
import { ActivitySummaryRow } from "@features/activity/components/ActivitySummaryRow";

const PAGE_SIZE = 20;

interface ActivityTableProps {
  activities: ActivitySummary[];
  classifications?: ReadonlyMap<string, SessionClassificationItem>;
  loading: boolean;
  error: string | null;
}

export function ActivityTable({ activities, classifications, loading, error }: ActivityTableProps) {
  const router = useRouter();
  const { byActivityId } = useSessionClassifications(undefined, undefined, classifications === undefined);
  const searchParams = useSearchParams();
  const pageParam = Number(searchParams.get("page") ?? "0");
  const page = Number.isInteger(pageParam) && pageParam >= 0 ? pageParam : 0;
  const totalPages = Math.max(1, Math.ceil(activities.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = activities.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const activityHref = (activityId: string) => {
    const params = new URLSearchParams(searchParams);
    if (safePage === 0) params.delete("page");
    else params.set("page", String(safePage));
    return activityDetailUrl(activityId, params.size ? `/activities?${params}` : "/activities");
  };
  const setPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams);
    if (nextPage === 0) params.delete("page");
    else params.set("page", String(nextPage));
    router.replace(`/activities${params.size > 0 ? `?${params.toString()}` : ""}`, { scroll: false });
  };
  const sessionLabel = (activityId: string) =>
    classifications?.get(activityId)?.session_classification.display_name ?? byActivityId.get(activityId)?.session_classification.display_name ?? "未分类";

  return (
    <Card padding="none" id="activities" data-testid="activity-table">
      <div className="border-b border-border-subtle px-4 py-3 sm:px-6">
        <h2 className="text-callout font-semibold text-text-primary sm:text-headline">活动记录</h2>
      </div>
      {error && <div className="px-6 py-12 text-center text-subheadline text-error">{error}</div>}
      {loading && !error && <div className="px-6 py-12 text-center text-subheadline text-text-muted">加载中...</div>}
      {!loading && !error && activities.length === 0 && (
        <div className="px-6 py-12 text-center text-subheadline text-text-muted">所选范围内暂无活动记录</div>
      )}
      {!loading && !error && activities.length > 0 && (
        <>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-subheadline">
              <thead>
                <tr className="border-b border-border-subtle text-left text-caption1 font-medium text-text-muted">
                  <th className="px-4 py-3">日期</th>
                  <th className="px-4 py-3">名称</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3 text-right">距离</th>
                  <th className="px-4 py-3 text-right">时长</th>
                  <th className="px-4 py-3 text-right">配速</th>
                  <th className="px-4 py-3">分类</th>
                  <th className="px-4 py-3 text-right">心率</th>
                  <th className="px-4 py-3 text-right">TSS</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((activity) => {
                  const cfg = getSportConfig(activity.sport);
                  const paceDisplay = cfg.isStrength ? "不适用" : formatPace(activity.avg_speed);
                  return (
                    <tr
                      key={activity.activity_id}
                      className="border-b border-border-subtle/50 transition-colors last:border-b-0 hover:bg-surface-overlay"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-text-primary">{formatDate(activity.start_time)}</td>
                      <td className="max-w-48 truncate px-4 py-3 font-medium text-text-primary">
                        <Link href={activityHref(activity.activity_id)} className="focus-ring rounded hover:underline">
                          {activityDisplayName(activity, classifications?.get(activity.activity_id) ?? byActivityId.get(activity.activity_id))}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{cfg.label}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-text-primary">{cfg.isStrength ? "不适用" : formatDistance(activity.distance_m)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-text-primary">{formatDuration(activity.duration_s)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-text-primary">{paceDisplay}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={activity.is_race ? "text-warm" : "text-text-muted"} data-testid="activity-table-classification">
                          {sessionLabel(activity.activity_id)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-text-primary">
                        {activity.avg_hr != null ? Math.round(activity.avg_hr) : NO_VALUE}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-text-primary">
                        {activity.tss != null ? Math.round(activity.tss) : NO_VALUE}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 bg-surface-sunken p-3 sm:hidden">
            {pageData.map((activity) => {
              return (
                <div key={activity.activity_id} className="rounded-2xl border border-border-subtle bg-surface-card">
                  <ActivitySummaryRow
                    activity={activity}
                    classification={classifications?.get(activity.activity_id) ?? byActivityId.get(activity.activity_id)}
                    href={activityHref(activity.activity_id)}
                  />
                </div>
              );
            })}
          </div>
          <ListPager page={safePage} totalPages={totalPages} totalItems={activities.length} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}
