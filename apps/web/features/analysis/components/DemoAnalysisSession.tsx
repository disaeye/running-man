"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Card } from "@shared/ui/Card";
import { LabelCaps } from "@shared/ui/LabelCaps";
import { athleteRange, useAthleteTimezone } from "@shared/lib/training-day";
import { useActivities } from "@features/activity/hooks/useActivities";
import { DemoActivityReport } from "@features/activity/components/DemoActivityReport";

/**
 * 分析页的「单次战报」模式。
 *
 * 参考稿的第三个导航项（分析）打开就是最近一场训练的完整回顾，所以这里是
 * 默认模式。战报主体用的是 `DemoActivityReport`——和活动详情页同一块，
 * 两处显示的内容不会各自走样。
 *
 * 最近一次训练取最近 90 天里的最新一条；这 90 天没有训练时，页面说明
 * 没有可回顾的内容并给出同步入口，而不是画一个空的战报。
 */
export function DemoAnalysisSession() {
  const timezone = useAthleteTimezone();
  const range = useMemo(() => athleteRange(90, timezone), [timezone]);
  const recent = useActivities(range.from, range.to);

  const latest = recent.data[0] ?? null;

  if (recent.loading) {
    return (
      <Card padding="md">
        <p className="text-subheadline text-text-muted" role="status" aria-busy="true">
          正在加载最近一次训练…
        </p>
      </Card>
    );
  }

  if (!latest) {
    return (
      <Card padding="md" data-testid="analysis-session-empty">
        <LabelCaps>SESSION REPORT · 单次战报</LabelCaps>
        <p className="mt-2 text-body text-text-secondary">
          最近 90 天还没有训练记录。同步 Intervals.icu 之后，这里会显示最近一场
          训练的完整回顾。
        </p>
        <Link
          href="/settings?section=data"
          className="focus-ring mt-3 inline-flex min-h-10 items-center rounded-full bg-surface-overlay px-4 text-caption1 font-medium text-accent transition-colors hover:bg-surface-active"
        >
          去同步数据
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="analysis-session">
      <div className="flex items-center justify-between gap-3">
        <LabelCaps>SESSION REPORT · 最近一次训练</LabelCaps>
        <Link
          href={`/activities/${latest.activity_id}`}
          className="focus-ring text-caption1 text-accent transition-colors hover:text-text-primary"
        >
          打开完整详情
        </Link>
      </div>
      <DemoActivityReport activityId={latest.activity_id} showStrength={false} />
    </div>
  );
}
