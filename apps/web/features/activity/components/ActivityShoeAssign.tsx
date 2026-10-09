"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import { SectionHeader } from "@shared/ui/SectionHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { useShoes, useShoeMutations } from "@features/activity/hooks/useGear";

export interface ActivityShoeAssignProps {
  activityId: string;
}

/**
 * Assign an active shoe to this activity so mileage accrues for retirement alerts.
 */
export function ActivityShoeAssign({ activityId }: ActivityShoeAssignProps) {
  const { data: shoes, loading, reload } = useShoes();
  const { assign } = useShoeMutations();
  const [shoeId, setShoeId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const active = shoes.filter((s) => !s.retired_at);

  async function handleAssign() {
    if (!shoeId) return;
    setBusy(true);
    setMsg(null);
    const row = await assign(shoeId, activityId);
    setBusy(false);
    if (!row) {
      setMsg("绑定失败，请稍后重试");
      return;
    }
    const name = active.find((s) => s.shoe_id === shoeId)?.name ?? "跑鞋";
    setMsg(`已绑定「${name}」，里程将计入该鞋`);
    reload();
  }

  if (loading && active.length === 0) {
    return (
      <Card padding="md" data-testid="activity-shoe-assign">
        <SectionHeader title="本场跑鞋" subtitle="加载中…" />
      </Card>
    );
  }

  if (active.length === 0) {
    return (
      <Card padding="md" data-testid="activity-shoe-assign">
        <SectionHeader title="本场跑鞋" />
        <p className="mt-3 text-footnote text-text-secondary">
          尚未登记跑鞋。添加后可累计里程并在接近退役时提醒。
        </p>
        <Link
          href="/settings?section=training"
          className="mt-3 inline-flex text-caption1 font-medium text-accent-strong hover:underline focus-ring"
        >
          去设置添加跑鞋 →
        </Link>
      </Card>
    );
  }

  return (
    <Card padding="md" data-testid="activity-shoe-assign">
      <SectionHeader title="本场跑鞋" subtitle="绑定后计入里程与退役提醒" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={shoeId || undefined} onValueChange={setShoeId}>
          <SelectTrigger
            className="min-h-[44px] min-w-[12rem] flex-1 bg-surface-overlay"
            aria-label="选择跑鞋"
          >
            <SelectValue placeholder="选择跑鞋…" />
          </SelectTrigger>
          <SelectContent>
            {active.map((s) => (
              <SelectItem key={s.shoe_id} value={s.shoe_id}>
                {s.name}
                {s.current_mileage_m > 0
                  ? ` · ${(s.current_mileage_m / 1000).toFixed(0)} km`
                  : ""}
                {s.retirement_alert ? " · 接近退役" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="secondary"
          disabled={!shoeId || busy}
          onClick={() => void handleAssign()}
        >
          {busy ? "绑定中…" : "绑定"}
        </Button>
      </div>
      {msg && (
        <p className="mt-2 text-footnote text-text-secondary" role="status">
          {msg}
        </p>
      )}
    </Card>
  );
}
