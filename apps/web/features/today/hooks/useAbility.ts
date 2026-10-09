"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import {
  getAbilityApiV1InsightsAbilityGet,
  getAbilityCurrentApiV1InsightsAbilityCurrentGet,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";

export interface TrainingPaceRange {
  min_s_per_km: number;
  max_s_per_km: number;
}

export interface TrainingPaces {
  easy: TrainingPaceRange | null;
  marathon: TrainingPaceRange | null;
  threshold: TrainingPaceRange | null;
  interval: TrainingPaceRange | null;
  repetition: TrainingPaceRange | null;
}

export interface AbilitySnapshot {
  vdot: number | null;
  threshold_pace_s_per_km: number | null;
  trainingPaces: TrainingPaces | null;
  data_available: boolean;
}

function emptyPaces(): TrainingPaces {
  return {
    easy: null,
    marathon: null,
    threshold: null,
    interval: null,
    repetition: null,
  };
}

function mapRange(
  raw: Generated.TrainingPaceRangeResponseOutput | null | undefined,
): TrainingPaceRange | null {
  if (!raw) return null;
  return { min_s_per_km: raw.min_s_per_km, max_s_per_km: raw.max_s_per_km };
}

function mapPaces(
  raw: Generated.TrainingPacesResponseOutput | null | undefined,
): TrainingPaces | null {
  if (!raw) return null;
  return {
    easy: mapRange(raw.easy),
    marathon: mapRange(raw.marathon),
    threshold: mapRange(raw.threshold),
    interval: mapRange(raw.interval),
    repetition: mapRange(raw.repetition),
  };
}

function mapSnapshot(raw: Generated.AbilitySnapshotResponseOutput): AbilitySnapshot {
  return {
    vdot: raw.vdot ?? null,
    threshold_pace_s_per_km: raw.threshold_pace_s_per_km ?? null,
    trainingPaces: mapPaces(raw.trainingPaces),
    data_available: raw.data_available || raw.vdot != null,
  };
}

function mapLegacyPoint(raw: Generated.AbilityPointResponseOutput): AbilitySnapshot {
  return {
    vdot: null,
    threshold_pace_s_per_km: raw.avgPace ?? null,
    trainingPaces: null,
    data_available: raw.avgPace != null,
  };
}

function fetchAbility(): Promise<AbilitySnapshot> {
  // Prefer the explicit current snapshot; fall back to the legacy list shape.
  return callOrvalValidated(
    (f) => getAbilityCurrentApiV1InsightsAbilityCurrentGet({}, f),
    Generated.AbilitySnapshotResponse,
  )
    .then(mapSnapshot)
    .catch(() =>
      callOrvalValidated(
        (f) => getAbilityApiV1InsightsAbilityGet({}, f),
        z.array(Generated.AbilityPointResponse),
      ).then((list) => {
        const first = list.length > 0 ? list[0] : null;
        if (!first) {
          return {
            vdot: null,
            threshold_pace_s_per_km: null,
            trainingPaces: emptyPaces(),
            data_available: false,
          };
        }
        return mapLegacyPoint(first);
      }),
    );
}

export function useAbility() {
  const { data, error, isLoading, mutate } = useSWR<AbilitySnapshot>(
    ["/insights/ability/current", {}],
    fetchAbility,
  );
  return {
    data: data ?? null,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : "能力数据加载失败") : null,
    reload: () => void mutate(),
  };
}

export function formatPaceRange(range: TrainingPaceRange | null): string {
  if (!range) return "--";
  return `${formatPace(range.min_s_per_km)}–${formatPace(range.max_s_per_km)}`;
}

export function formatPace(secPerKm: number | null | undefined): string {
  if (secPerKm == null || secPerKm <= 0) return "--";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60)
    .toString()
    .padStart(2, "0");
  return `${m}'${s}"`;
}
