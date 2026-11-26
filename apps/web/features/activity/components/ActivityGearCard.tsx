"use client";

import { useState } from "react";
import type { ActivityDetail } from "@shared/types/activity";
import { PageCard } from "@shared/ui/Card";
import { useToast } from "@shared/ui/Toast";
import { useShoeMutations, useShoes } from "@features/activity/hooks/useGear";

function readRawNotes(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const note = (raw as { description?: unknown; notes?: unknown }).description
    ?? (raw as { notes?: unknown }).notes;
  return typeof note === "string" && note.trim() ? note.trim() : null;
}

export function ActivityGearCard({
  activityId,
  activity,
}: {
  activityId: string;
  activity: ActivityDetail;
}) {
  const { toast } = useToast();
  const shoes = useShoes();
  const mutations = useShoeMutations();
  const [selected, setSelected] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const rawNotes = readRawNotes(activity.raw_data);

  async function assign() {
    if (!selected || assigning) return;
    setAssigning(true);
    setMessage(null);
    try {
      const result = await mutations.assign(selected, activityId);
      if (result) {
        shoes.reload();
        setMessage({ text: "跑鞋已关联", ok: true });
        toast("跑鞋已关联", "success");
      } else {
        setMessage({ text: "关联失败，请稍后重试", ok: false });
        toast("跑鞋关联失败", "error");
      }
    } finally {
      setAssigning(false);
    }
  }

  return (
    <PageCard title="装备与技术细节">
      <div className="space-y-3">
        <div className="flex gap-2">
          <select
            aria-label="选择跑鞋"
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              setMessage(null);
            }}
            className="min-h-11 min-w-0 flex-1 rounded-lg bg-secondary px-3 text-sm text-text-primary"
          >
            <option value="">选择本次使用的跑鞋</option>
            {shoes.data
              .filter((shoe) => !shoe.retired_at)
              .map((shoe) => (
                <option key={shoe.shoe_id} value={shoe.shoe_id}>
                  {shoe.name} ({Math.round(shoe.current_mileage_m / 1000)} km)
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={() => void assign()}
            disabled={!selected || assigning}
            className="min-h-11 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            {assigning ? "关联中…" : "关联"}
          </button>
        </div>

        {rawNotes ? (
          <div className="rounded-lg bg-secondary/60 p-2.5 text-caption1 text-text-secondary">
            <span className="mb-0.5 block text-text-muted">同步备注</span>
            <p className="whitespace-pre-wrap">{rawNotes}</p>
          </div>
        ) : null}

        <p className="text-sm text-muted-foreground">
          {activity.avg_stride_length_m != null
            ? `平均步幅 ${activity.avg_stride_length_m.toFixed(2)} m`
            : "暂无步幅记录"}{" "}
          · {activity.rpe != null ? `RPE ${activity.rpe}` : "未记录主观感受"}
        </p>

        {message ? (
          <p role="status" className={`text-xs ${message.ok ? "text-success" : "text-error"}`}>
            {message.text}
          </p>
        ) : null}
      </div>
    </PageCard>
  );
}
