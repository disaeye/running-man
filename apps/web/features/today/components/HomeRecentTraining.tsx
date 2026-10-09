"use client";

import Link from "next/link";
import { EmptyState } from "@shared/ui/EmptyState";
import { SectionHeader } from "@shared/ui/SectionHeader";
import { Skeleton } from "@shared/ui/Skeleton";
import { SessionCard } from "@features/activity/components/SessionCard";
import type { ActivitySummary } from "@shared/types/activity";

export interface HomeRecentTrainingProps {
  activities: readonly ActivitySummary[];
  loading: boolean;
  className?: string;
}

export function HomeRecentTraining({
  activities,
  loading,
  className = "",
}: HomeRecentTrainingProps) {
  return (
    <section
      className={`flex min-w-0 flex-col gap-3 ${className}`.trim()}
      data-testid="home-recent"
      aria-label="最近训练"
    >
      <SectionHeader
        title="最近训练"
        action={
          <Link
            href="/calendar?view=list"
            className="text-caption1 font-medium text-accent-strong transition-opacity hover:opacity-80 focus-ring"
          >
            全部 →
          </Link>
        }
      />
      <RecentTrainingBody activities={activities} loading={loading} />
    </section>
  );
}

function RecentTrainingBody({
  activities,
  loading,
}: {
  activities: readonly ActivitySummary[];
  loading: boolean;
}) {
  if (loading && activities.length === 0) {
    return (
      <div className="grid gap-2 sm:grid-cols-3" data-testid="home-recent-skeleton">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rectangular" height={88} />
        ))}
      </div>
    );
  }
  if (activities.length === 0) {
    return (
      <EmptyState
        title="还没有训练记录"
        description="同步 Intervals.icu 后，最近 3 次训练会显示在这里。"
        action={
          <Link
            href="/settings?section=data"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-subheadline font-semibold text-on-accent transition-transform hover:scale-[0.98] focus-ring"
          >
            同步 Intervals.icu
          </Link>
        }
      />
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-3" data-testid="home-recent-list">
      {activities.map((activity) => (
        <SessionCard key={activity.activity_id} activity={activity} showRoute />
      ))}
    </div>
  );
}
