"use client";

import { useState } from "react";
import type { ActivityDetail } from "@shared/types/activity";
import { PageCard } from "@shared/ui/Lovable";
import { useShoeMutations, useShoes } from "@features/activity/hooks/useGear";

export function ActivityGearCard({
  activityId,
  activity,
}: {
  activityId: string;
  activity: ActivityDetail;
}) {
  const shoes = useShoes();
  const mutations = useShoeMutations();
  const [selected, setSelected] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function assign() {
    if (!selected) return;
    const result = await mutations.assign(selected, activityId);
    setMessage(result ? "跑鞋已关联" : "关联失败，请稍后重试");
  }

  return (
    <PageCard title="装备与备注">
      <div className="space-y-3">
        <div className="flex gap-2">
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-lg bg-secondary px-3 text-sm"
          >
            <option value="">选择本次使用的跑鞋</option>
            {shoes.data
              .filter((shoe) => !shoe.retired_at)
              .map((shoe) => (
                <option key={shoe.shoe_id} value={shoe.shoe_id}>
                  {shoe.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={() => void assign()}
            disabled={!selected}
            className="min-h-11 rounded-lg bg-primary px-4 text-xs text-primary-foreground disabled:opacity-40"
          >
            关联
          </button>
        </div>

        <div className="space-y-1">
          <label htmlFor="activity-notes" className="text-caption1 text-muted-foreground">
            训练备注
          </label>
          <textarea
            id="activity-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="记录训练感受、路线路况、天气感受…"
            className="w-full rounded-lg bg-secondary p-2.5 text-xs text-text-primary placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <p className="text-sm text-muted-foreground">
          {activity.avg_stride_length_m != null
            ? `平均步幅 ${activity.avg_stride_length_m.toFixed(2)} m`
            : "暂无步幅记录"}{" "}
          · {activity.rpe != null ? `RPE ${activity.rpe}` : "未记录主观感受"}
        </p>

        {message ? (
          <p className="text-xs text-accent-strong">{message}</p>
        ) : null}
      </div>
    </PageCard>
  );
}
