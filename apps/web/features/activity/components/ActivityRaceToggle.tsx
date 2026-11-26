"use client";

import { useState } from "react";
import { useToast } from "@shared/ui/Toast";
import { useActivityFlagging } from "@features/activity/hooks/useActivityFlagging";

export function ActivityRaceToggle({
  activityId,
  isRace,
  onDone,
}: {
  activityId: string;
  isRace: boolean;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { setRace, pending, error } = useActivityFlagging();
  const [optimisticRace, setOptimisticRace] = useState<boolean | undefined>(undefined);
  const shownRace = optimisticRace !== undefined ? optimisticRace : isRace;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-border-default px-3 text-caption1 text-text-secondary">
        <input
          aria-label="比赛活动"
          className="size-5 accent-accent"
          type="checkbox"
          checked={shownRace}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.checked;
            setOptimisticRace(next);
            void setRace(activityId, next).then((ok) => {
              setOptimisticRace(undefined);
              if (ok) {
                toast(next ? "已标记为比赛活动" : "已取消比赛标记", "success");
                onDone();
              }
            });
          }}
        />
        比赛
      </label>
      {error && <span role="alert" className="text-caption1 text-error">{error}</span>}
    </div>
  );
}
