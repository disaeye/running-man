"use client";

import Link from "next/link";
import { PageCard } from "@shared/ui/Lovable";
import { useSyncDetail } from "@features/data/hooks/useSyncDetail";

/**
 * 本周没有内容时只说清是哪一种空，并给下一步。
 * 连接状态与首页读同一个 SWR key，不会出现两处不同的结论。
 */
export function TrainingEmptyState({
  hasPlan,
  missingSessions,
  isCurrentWeek = true,
  onPlan,
  onGenerate,
}: {
  readonly hasPlan: boolean;
  readonly missingSessions: readonly string[];
  readonly isCurrentWeek?: boolean;
  readonly onPlan: () => void;
  readonly onGenerate?: () => void;
}) {
  const { data, loading } = useSyncDetail("intervals_icu");
  if (loading || (data && data.status === "unknown")) return null;
  if (data && data.status !== "connected") {
    return (
      <PageCard testId="training-empty-state">
        <h2 className="text-subheadline font-semibold">还没有连接数据源</h2>
        <p className="mt-1 text-caption1 text-text-muted">
          连接 Intervals.icu 后，训练计划和已完成的运动会自动出现在这里。
        </p>
        <Link href="/settings?section=data" className="mt-2 inline-flex min-h-11 items-center text-caption1 text-accent-strong hover:underline">
          去连接
        </Link>
      </PageCard>
    );
  }
  if (!hasPlan) {
    return (
      <PageCard testId="training-empty-state">
        <h2 className="text-subheadline font-semibold">{isCurrentWeek ? "这周还没有安排" : "该周还没有安排"}</h2>
        <p className="mt-1 text-caption1 text-text-muted">按比赛目标自动生成周期课表，或手动编排单节训练。</p>
        <div className="mt-2 flex flex-wrap gap-4">
          <button type="button" onClick={onPlan} className="tactile min-h-11 text-caption1 text-accent-strong hover:underline">
            {isCurrentWeek ? "编排本周" : "编排该周"}
          </button>
          {onGenerate ? (
            <button type="button" onClick={onGenerate} className="tactile min-h-11 text-caption1 text-text-primary hover:underline">
              从目标生成计划
            </button>
          ) : null}
        </div>
      </PageCard>
    );
  }
  if (missingSessions.length > 0) {
    return (
      <PageCard testId="training-empty-state">
        <h2 className="text-subheadline font-semibold">还有 {missingSessions.length} 课没有完成</h2>
        <ul className="mt-1 space-y-1 text-caption1 text-text-muted">
          {missingSessions.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}
        </ul>
      </PageCard>
    );
  }
  return null;
}
