"use client";

import Link from "next/link";
import { PageCard } from "@shared/ui/Card";
import { useSyncDetail } from "@features/data/hooks/useSyncDetail";

/**
 * 数据源未连接引导。全页只在周视图出现一次；
 * 已连接时无论有没有排课都不渲染，避免与周汇总和每日行重复。
 */
export function TrainingConnectionNotice() {
  const { data, loading } = useSyncDetail("intervals_icu");
  if (loading || (data && data.status === "unknown")) return null;
  if (data && data.status === "connected") return null;
  return (
    <PageCard testId="training-connection-notice">
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
