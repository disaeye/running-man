"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { listExercisesApiV1StrengthExercisesGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";

export interface Exercise {
  id: string;
  name_cn: string;
  name_en: string;
  category: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: string;
  movement_pattern: string;
  instructions: string;
  common_mistakes: string;
  difficulty: string;
}

interface UseExercisesResult {
  data: Exercise[];
  loading: boolean;
  error: string | null;
}

function mapExercise(row: Generated.ExerciseLibraryItemOutput): Exercise {
  return {
    id: String(row.id),
    name_cn: row.name_cn,
    name_en: row.name_en,
    category: row.category,
    primary_muscles: row.primary_muscles,
    secondary_muscles: row.secondary_muscles ?? [],
    equipment: row.equipment ?? "",
    movement_pattern: row.movement_pattern ?? "",
    instructions: row.instructions ?? "",
    common_mistakes: row.common_mistakes ?? "",
    difficulty: row.difficulty ?? "",
  };
}

export function useExercises(
  query = "",
  category = "",
): UseExercisesResult {
  const params: { query?: string; category?: string } = {};
  const trimmedQuery = query.trim();
  if (trimmedQuery) params.query = trimmedQuery;
  if (category) params.category = category;

  const { data, error, isLoading } = useSWR<Exercise[]>(
    ["/strength/exercises", params],
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => listExercisesApiV1StrengthExercisesGet(params, {}, f),
          z.array(Generated.ExerciseLibraryItem),
        ).then((rows) => rows.map(mapExercise)),
    },
  );

  return { data: data ?? [], loading: isLoading, error: error?.message ?? null };
}
