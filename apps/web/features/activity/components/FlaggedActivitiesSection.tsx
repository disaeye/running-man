"use client";

import useSWR from "swr";
import { Card } from "@shared/ui/Card";
import { Skeleton } from "@shared/ui/Skeleton";
import { formatDate, formatDistance, formatDuration } from "@shared/lib/format";
import { getSportConfig } from "@shared/config/sport-config";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import {
  getIgnoredActivitiesApiV1ActivitiesIgnoredGet,
  getTrashedActivitiesApiV1ActivitiesTrashGet,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { ActivityRestoreActions } from "@features/activity/components/ActivityFlagActions";

interface FlaggedActivity {
  activityId: string;
  startTime: string;
  sport: string;
  distanceM: number | null;
  durationS: number | null;
  flaggedAt: string | null;
}

/**
 * Activities the athlete has taken out of the numbers, and how to put them back.
 *
 * Two lists because the two flags mean different things: ignored activities are
 * still part of the record (a walk that should not count as training), while
 * trashed ones are considered wrong or unwanted (a duplicate import). Without
 * this view both operations would be one-way in practice — the API supports
 * undo, but nothing in the UI would expose it.
 */
export function FlaggedActivitiesSection() {
  const ignored = useSWR<FlaggedActivity[]>(
    ["/activities/ignored", {}],
    () =>
      callOrvalValidated(
        (f) => getIgnoredActivitiesApiV1ActivitiesIgnoredGet({}, f),
        Generated.FlaggedActivity.array(),
      ).then((rows) => rows.map(mapRow)),
  );
  const trashed = useSWR<FlaggedActivity[]>(
    ["/activities/trash", {}],
    () =>
      callOrvalValidated(
        (f) => getTrashedActivitiesApiV1ActivitiesTrashGet({}, f),
        Generated.FlaggedActivity.array(),
      ).then((rows) => rows.map(mapRow)),
  );

  const reloadAll = () => {
    void ignored.mutate();
    void trashed.mutate();
  };

  return (
    <div className="space-y-6" data-testid="flagged-activities">
      <FlaggedList
        title="已忽略的训练"
        description="保留在记录中，但不计入训练负荷、PMC、个人纪录与心率区间统计。"
        rows={ignored.data}
        loading={ignored.isLoading}
        mode="ignored"
        emptyLabel="没有被忽略的训练"
        onChanged={reloadAll}
      />
      <FlaggedList
        title="回收站"
        description="已从列表隐藏，且再次同步时不会重新导入。可随时恢复。"
        rows={trashed.data}
        loading={trashed.isLoading}
        mode="trash"
        emptyLabel="回收站是空的"
        onChanged={reloadAll}
      />
    </div>
  );
}

function FlaggedList({
  title,
  description,
  rows,
  loading,
  mode,
  emptyLabel,
  onChanged,
}: {
  title: string;
  description: string;
  rows: FlaggedActivity[] | undefined;
  loading: boolean;
  mode: "ignored" | "trash";
  emptyLabel: string;
  onChanged: () => void;
}) {
  if (loading) return <Skeleton className="h-32 w-full" />;

  const items = rows ?? [];

  return (
    <Card padding="sm">
      <h3 className="text-headline font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 text-caption1 text-text-muted">{description}</p>
      {items.length === 0 ? (
        <p className="mt-3 text-subheadline text-text-muted" data-testid={`${mode}-empty`}>
          {emptyLabel}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border-subtle">
          {items.map((item) => {
            const config = getSportConfig(item.sport);
            return (
              <li key={item.activityId} className="flex flex-wrap items-center gap-3 py-2.5">
                <span
                  className="rounded-full border border-border-subtle px-2 py-0.5 text-caption2 font-medium"
                  style={{ color: config.color }}
                >
                  {config.label}
                </span>
                <span className="text-caption1 text-text-secondary">
                  {formatDate(item.startTime)}
                </span>
                <span className="font-mono text-caption1 text-text-muted">
                  {item.distanceM != null ? formatDistance(item.distanceM) : "—"}
                  {item.durationS != null && ` · ${formatDuration(item.durationS)}`}
                </span>
                <span className="ml-auto">
                  <ActivityRestoreActions
                    activityId={item.activityId}
                    mode={mode}
                    onDone={onChanged}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function mapRow(raw: {
  activity_id: string;
  start_time: string;
  sport: string;
  distance_m?: number | null;
  duration_s?: number | null;
  ignored_at?: string | null;
  deleted_at?: string | null;
}): FlaggedActivity {
  return {
    activityId: raw.activity_id,
    startTime: raw.start_time,
    sport: raw.sport,
    distanceM: raw.distance_m ?? null,
    durationS: raw.duration_s ?? null,
    flaggedAt: raw.ignored_at ?? raw.deleted_at ?? null,
  };
}
