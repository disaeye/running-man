"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import {
  getPlanRevisionApiV1PlanRevisionsRevisionIdGet,
  listPlanRevisionsApiV1PlanRevisionsGet,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";

export interface PlanRevisionSummaryView {
  readonly revision_id: string;
  readonly reason: string;
  readonly events_created: number;
  readonly phases_created: number;
  readonly created_at: string | null;
}

/** 一个目标的全部计划版本，最新在前。 */
export function usePlanRevisions(goalId: string | null) {
  const { data, error, isLoading } = useSWR<PlanRevisionSummaryView[]>(
    goalId ? ["/plan/revisions", goalId] : null,
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => listPlanRevisionsApiV1PlanRevisionsGet({ goal_id: goalId ?? "" }, {}, f),
          z.array(Generated.PlanRevisionSummary),
        ).then((rows) =>
          rows.map((row) => ({
            revision_id: row.revision_id,
            reason: row.reason,
            events_created: row.events_created,
            phases_created: row.phases_created,
            created_at: row.created_at ?? null,
          })),
        ),
    },
  );
  return { revisions: data ?? [], loading: isLoading, error: error?.message ?? null };
}

/** 单个版本的完整快照（当时排定的课表与阶段）。 */
export async function fetchPlanRevision(revisionId: string) {
  return callOrvalValidated(
    (f) => getPlanRevisionApiV1PlanRevisionsRevisionIdGet(revisionId, {}, f),
    Generated.PlanRevisionDetail,
  );
}
