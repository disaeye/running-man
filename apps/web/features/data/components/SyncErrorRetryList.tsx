"use client";

import { useState } from "react";
import { Button } from "@shared/ui/button";
import { useToast } from "@shared/ui/Toast";
import { retryActivityStreams } from "@features/data/hooks/useSyncJobs";

export interface SyncErrorItem {
  activity_id?: string;
  activityId?: string;
  message?: string;
}

interface SyncErrorRetryListProps {
  errors: SyncErrorItem[];
}

export function SyncErrorRetryList({ errors }: SyncErrorRetryListProps) {
  const { toast } = useToast();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [fixedIds, setFixedIds] = useState<Set<string>>(() => new Set());

  if (errors.length === 0) return null;

  const handleRetry = async (activityId: string) => {
    setRetryingId(activityId);
    try {
      const inserted = await retryActivityStreams(activityId);
      setFixedIds((prev) => new Set(prev).add(activityId));
      toast(`活动 ${activityId} 流数据已重新拉取（${inserted} 条样本）`, "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "重试失败";
      toast(`流数据重试失败: ${msg}`, "error");
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-2">
      <h4 className="text-subheadline font-semibold text-text-primary">
        失败活动项（可单条重试）
      </h4>
      <div className="space-y-2 max-h-56 overflow-y-auto">
        {errors.map((item, idx) => {
          const actId = item.activity_id ?? item.activityId ?? `error-${idx}`;
          const isFixed = fixedIds.has(actId);
          const isBusy = retryingId === actId;

          return (
            <div
              key={actId}
              className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border-default bg-surface-sunken/60 text-caption1"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium text-text-primary truncate">
                    {actId}
                  </span>
                  {isFixed && (
                    <span className="text-caption1 px-1.5 py-0.5 rounded bg-success/15 text-success font-medium">
                      已重取
                    </span>
                  )}
                </div>
                {item.message && (
                  <p className="text-caption1 text-error truncate mt-0.5">
                    {item.message}
                  </p>
                )}
              </div>
              <Button
                size="xs"
                variant={isFixed ? "outline" : "secondary"}
                disabled={isFixed || isBusy}
                onClick={() => handleRetry(actId)}
              >
                {isBusy ? "重试中…" : isFixed ? "已完成" : "重试流数据"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
