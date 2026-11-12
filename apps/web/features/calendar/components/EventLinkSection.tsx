"use client";

import { useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { Button } from "@shared/ui/button";
import { callOrval, callOrvalValidated } from "@shared/api/orval-adapter";
import {
  linkEventApiV1CalendarEventIdLinkPost,
  updateEventApiV1CalendarEventIdPut,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { useToast } from "@shared/ui/Toast";
import { getSportConfig } from "@shared/config/sport-config";
import { formatDistance, formatDuration } from "@shared/lib/format";
import type { ActivitySummary } from "@shared/types/activity";
import type { CalendarEventDTO } from "@features/calendar/components/types";

interface EventLinkSectionProps {
  readonly event: CalendarEventDTO;
  readonly activities: readonly ActivitySummary[];
  readonly onSaved: () => void;
}

/** 课表关联区块：把已同步的活动绑定到计划课，或解除绑定。 */
export function EventLinkSection({ event, activities, onSaved }: EventLinkSectionProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      toast(message, "success");
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const link = (activityId: string) =>
    run(
      () =>
        callOrval((fetcher) =>
          linkEventApiV1CalendarEventIdLinkPost(event.event_id, { activity_id: activityId }, {}, fetcher),
        ),
      "已关联到课表",
    );

  const unlink = () =>
    run(
      () =>
        callOrvalValidated(
          (fetcher) =>
            updateEventApiV1CalendarEventIdPut(
              event.event_id,
              { linked_activity_id: null, done: false, status: "planned" },
              {},
              fetcher,
            ),
          Generated.CalendarEventOutput,
        ),
      "已取消关联",
    );

  const linked = event.linked_activity_id
    ? activities.find((activity) => activity.activity_id === event.linked_activity_id) ?? null
    : null;

  if (linked) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-overlay/45 p-3" aria-label="课表关联">
        <div className="flex items-center justify-between gap-2">
          <ActivityLine activity={linked} prefix="已关联：" />
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void unlink()}>
            <Unlink className="size-3.5" aria-hidden />
            取消关联
          </Button>
        </div>
        {error ? <p role="alert" className="text-caption1 text-error">{error}</p> : null}
      </section>
    );
  }

  const candidates = activities.filter((activity) => activity.activity_id !== event.linked_activity_id);
  if (candidates.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-overlay/45 p-3" aria-label="课表关联">
      <span className="flex items-center gap-1.5 text-caption1 font-semibold text-text-secondary">
        <Link2 className="size-3.5" aria-hidden />
        把当天的活动关联到这节课
      </span>
      <ul className="space-y-1.5">
        {candidates.map((activity) => (
          <li key={activity.activity_id} className="flex items-center justify-between gap-2">
            <ActivityLine activity={activity} />
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void link(activity.activity_id)}>
              关联
            </Button>
          </li>
        ))}
      </ul>
      {error ? <p role="alert" className="text-caption1 text-error">{error}</p> : null}
    </section>
  );
}

function ActivityLine({ activity, prefix }: { readonly activity: ActivitySummary; readonly prefix?: string }) {
  const label = activity.name?.trim() || getSportConfig(activity.sport).label;
  const detail = [
    activity.distance_m != null ? formatDistance(activity.distance_m) : null,
    activity.duration_s != null ? formatDuration(activity.duration_s) : null,
  ].filter(Boolean).join(" · ");
  return (
    <span className="min-w-0 flex-1 truncate text-caption1 text-text-primary">
      {prefix ?? ""}{label}{detail ? ` · ${detail}` : ""}
    </span>
  );
}
