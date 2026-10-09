"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { callOrval, callOrvalValidated } from "@shared/api/orval-adapter";
import {
  listTemplatesApiV1WorkoutsTemplatesGet,
  createTemplateApiV1WorkoutsTemplatesPost,
  updateTemplateApiV1WorkoutsTemplatesTemplateIdPut,
  deleteTemplateApiV1WorkoutsTemplatesTemplateIdDelete,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";
import type {
  WorkoutTemplate,
  WorkoutTemplateCreate,
  WorkoutTemplateUpdate,
} from "@shared/types/workout-templates";

interface Filters {
  sport?: string;
  goal?: string;
}

interface FiltersParams {
  sport?: string;
  goal_type?: string;
}

function parseTemplateSource(value: string): "builtin" | "user" {
  switch (value) {
    case "builtin":
      return "builtin";
    case "user":
      return "user";
    default:
      return "user";
  }
}

function mapTemplate(raw: Generated.WorkoutTemplateResponseOutput): WorkoutTemplate {
  return {
    template_id: raw.template_id,
    athlete_id: raw.athlete_id ?? null,
    name: raw.name,
    sport: raw.sport,
    goal_type: raw.goal_type ?? null,
    segments: raw.segments ?? null,
    predicted_tss: raw.predicted_tss ?? null,
    source: parseTemplateSource(raw.source),
    created_at: raw.created_at,
  };
}

export function useWorkoutTemplates(filters: Filters = {}) {
  const params: FiltersParams = {};
  if (filters.sport) params.sport = filters.sport;
  if (filters.goal) params.goal_type = filters.goal;

  const { data, error, isLoading, mutate } = useSWR<WorkoutTemplate[]>(
    ["/workouts/templates", params],
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => listTemplatesApiV1WorkoutsTemplatesGet(params, {}, f),
          z.array(Generated.WorkoutTemplateResponse),
        ).then((rows) => rows.map(mapTemplate)),
    },
  );
  const templates = data ?? [];

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const create = useCallback(
    async (payload: WorkoutTemplateCreate): Promise<WorkoutTemplate> => {
      const body: Generated.WorkoutTemplateCreate = {
        name: payload.name,
        sport: payload.sport,
        goal_type: payload.goal_type,
        segments: payload.segments,
        predicted_tss: payload.predicted_tss,
      };
      const data = await callOrvalValidated(
        (f) => createTemplateApiV1WorkoutsTemplatesPost(body, {}, f),
        Generated.WorkoutTemplateResponse,
      );
      await mutate();
      return mapTemplate(data);
    },
    [mutate],
  );

  const update = useCallback(
    async (id: string, payload: WorkoutTemplateUpdate): Promise<WorkoutTemplate> => {
      const body: Generated.WorkoutTemplateUpdate = {
        name: payload.name,
        sport: payload.sport,
        goal_type: payload.goal_type,
        segments: payload.segments,
        predicted_tss: payload.predicted_tss,
      };
      const data = await callOrvalValidated(
        (f) => updateTemplateApiV1WorkoutsTemplatesTemplateIdPut(id, body, {}, f),
        Generated.WorkoutTemplateResponse,
      );
      await mutate();
      return mapTemplate(data);
    },
    [mutate],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await callOrval((f) => deleteTemplateApiV1WorkoutsTemplatesTemplateIdDelete(id, {}, f));
      await mutate();
    },
    [mutate],
  );

  return {
    templates,
    loading: isLoading,
    error: error?.message ?? null,
    refresh,
    create,
    update,
    remove,
  };
}
