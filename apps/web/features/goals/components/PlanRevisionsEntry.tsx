"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { Button } from "@shared/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/ui/dialog";
import { Tag } from "@shared/ui/Badge";
import { Skeleton } from "@shared/ui/Skeleton";
import { usePlanRevisions, fetchPlanRevision } from "@features/goals/hooks/usePlanRevisions";
import { phaseLabel } from "@features/goals/lib/phase-labels";
import { formatDate, formatPaceFromSeconds } from "@shared/lib/format";
import type * as Generated from "@shared/api/generated/model";

const REASON_LABELS: Record<string, string> = {
  generate: "生成计划",
};

/** 计划版本入口按钮 + 弹层：版本列表与单版本快照。 */
export function PlanRevisionsEntry({ goalId }: { goalId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tactile inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border-default px-3.5 text-caption1 text-text-secondary hover:bg-secondary"
      >
        <History className="size-3.5" aria-hidden />
        计划版本
      </button>
      {open ? <PlanRevisionsDialog goalId={goalId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PlanRevisionsDialog({ goalId, onClose }: { goalId: string; onClose: () => void }) {
  const { revisions, loading, error } = usePlanRevisions(goalId);
  const [detailId, setDetailId] = useState<string | null>(null);

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-xl" mobileSheet>
        <DialogHeader>
          <DialogTitle>{detailId ? "版本快照" : "计划版本"}</DialogTitle>
        </DialogHeader>
        {detailId ? (
          <RevisionDetail revisionId={detailId} onBack={() => setDetailId(null)} />
        ) : loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : error ? (
          <p role="alert" className="text-caption1 text-error">{error}</p>
        ) : revisions.length === 0 ? (
          <p className="text-caption1 text-muted-foreground">还没有生成过计划。</p>
        ) : (
          <ul className="space-y-2 md:max-h-[52dvh] md:overflow-y-auto md:pr-1">
            {revisions.map((revision) => (
              <li key={revision.revision_id}>
                <button
                  type="button"
                  onClick={() => setDetailId(revision.revision_id)}
                  className="tactile flex w-full items-center justify-between gap-3 rounded-xl border border-border-default p-3 text-left hover:bg-secondary/60"
                >
                  <span>
                    <span className="block text-subheadline font-medium text-text-primary">
                      {REASON_LABELS[revision.reason] ?? revision.reason}
                    </span>
                    <span className="num block text-caption1 text-text-muted">
                      {revision.created_at ? formatDate(revision.created_at.slice(0, 10)) : ""}
                      {revision.created_at ? ` ${revision.created_at.slice(11, 16)}` : ""}
                    </span>
                  </span>
                  <Tag tone="muted">{revision.events_created} 课</Tag>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="sticky -bottom-6 z-10 -mx-6 -mb-6 flex justify-end border-t border-border-subtle bg-surface-card px-6 py-4">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RevisionDetail({ revisionId, onBack }: { revisionId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<Generated.PlanRevisionDetailOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchPlanRevision(revisionId)
      .then((result) => { if (active) setDetail(result); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "读取版本失败");
      });
    return () => { active = false; };
  }, [revisionId]);

  if (error) {
    return (
      <div>
        <p role="alert" className="text-caption1 text-error">{error}</p>
        <button type="button" onClick={onBack} className="mt-2 inline-flex min-h-11 items-center text-caption1 text-accent-strong">返回列表</button>
      </div>
    );
  }
  if (!detail) return <Skeleton className="h-24 w-full" />;

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center self-start text-caption1 text-accent-strong hover:underline">
        返回版本列表
      </button>
      <div className="flex flex-wrap gap-2">
        {(detail.phases ?? []).map((phase, index) => (
          <Tag key={`${phase.name}-${index}`} tone="muted">
            {phaseLabel(phase.name)} · {phase.start_date} 至 {phase.end_date}
          </Tag>
        ))}
      </div>
      <div className="space-y-3 md:max-h-[52dvh] md:overflow-y-auto md:pr-1">
        {groupEventsByPhase(detail.events ?? []).map(([phase, events]) => (
          <div key={phase} className="space-y-1.5">
            <div className="text-caption1 font-medium text-text-secondary">
              {phaseLabel(phase)} · {events.length} 课
            </div>
            <ol className="space-y-1.5">
              {events.map((event, index) => (
                <li key={`${event.event_id}-${index}`} className="rounded-lg bg-surface-overlay/50 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-caption1 font-medium text-text-primary">{event.date} · {event.name}</span>
                  </div>
                  <p className="num mt-0.5 text-caption1 text-text-muted">
                    {event.duration_min} 分钟
                    {event.predicted_tss != null ? ` · TSS ${Math.round(event.predicted_tss)}` : ""}
                    {event.pace_min_s_km != null && event.pace_max_s_km != null
                      ? ` · ${formatPaceFromSeconds(event.pace_min_s_km)}–${formatPaceFromSeconds(event.pace_max_s_km)} /公里`
                      : ""}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

function groupEventsByPhase(
  events: readonly NonNullable<Generated.PlanRevisionDetailOutput["events"]>[number][],
) {
  const map = new Map<string, NonNullable<Generated.PlanRevisionDetailOutput["events"]>[number][]>();
  for (const event of events) {
    const key = event.phase || "base";
    const list = map.get(key);
    if (list) list.push(event);
    else map.set(key, [event]);
  }
  return Array.from(map.entries());
}
