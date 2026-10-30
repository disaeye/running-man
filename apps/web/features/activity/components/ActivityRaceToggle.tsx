"use client";

import { useState } from "react";
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
  const { setRace, pending, error } = useActivityFlagging();
  const [value, setValue] = useState(isRace);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-border-default px-3 text-caption1 text-text-secondary">
        <input
          aria-label="比赛活动"
          className="size-5 accent-accent"
          type="checkbox"
          checked={value}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.checked;
            setValue(next);
            void setRace(activityId, next).then((ok) => {
              if (ok) onDone();
              else setValue(!next);
            });
          }}
        />
        比赛
      </label>
      {error && <span role="alert" className="text-caption1 text-error">{error}</span>}
    </div>
  );
}
