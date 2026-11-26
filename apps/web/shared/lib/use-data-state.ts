"use client";

import { apiErrorMessage } from "./api";

/**
 * Unified data display state.
 *
 * `useDataState` translates the four inputs a SWR-backed (or any fetching) page
 * actually owns — `data`, `error`, `isLoading`, `dataAsOf` — into a single
 * high-level state that the <DataState> component can switch on.
 *
 * Seven states, but this hook only emits five: `loading`, `source-error`,
 * `source-empty`, `stale`, `ready`. The remaining two (`field-missing`,
 * `needs-action`) require domain knowledge (which field is missing, what
 * action to prompt) and are set by callers passing the resulting state into
 * <DataState> directly.
 *
 * Pure logic — no React, no fetching — so it can be unit-tested with plain
 * inputs.
 */

export type DataStateType =
  | "loading"
  | "source-error"
  | "source-empty"
  | "field-missing"
  | "stale"
  | "ready"
  | "needs-action";

/**
 * How old data may be and still count as current.
 *
 * One day, matching `staleness_bucket` in the API. A second threshold here
 * meant a two-day-old dataset could read as current on this component and as
 * expired in the shell's sync indicator at the same moment.
 */
export const FRESH_WITHIN_DAYS = 1;

/** Canonical Chinese labels for data display states (single source of truth). */
export const LOADING_LABEL = "加载中...";
export const EMPTY_LABEL = "暂无数据";
export const ERROR_LABEL = "加载失败";

/**
 * The placeholder for a value that exists as a field but has no measurement.
 *
 * Unified across tables, stats and strips as "未记录", never bare `--`/`—`.
 */
export const NO_VALUE = "未记录";

export function formatMetricOrUnrecorded(
  value: string | number | null | undefined,
  unit?: string,
): string {
  if (value == null || value === "") return NO_VALUE;
  return unit ? `${value} ${unit}` : String(value);
}

export interface UseDataStateInput<T> {
  data: T | null | undefined;
  error?: unknown;
  isLoading?: boolean;
  dataAsOf?: string | null;
  /** Override how many days of lag still count as fresh. */
  freshWithinDays?: number;
  /**
   * Predicate deciding whether a non-null `data` actually has rows worth
   * showing. Defaults to "any non-null value is data".
   */
  hasData?: (v: T) => boolean;
}

function errorMessage(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (typeof error === "string") return error;
  // One place decides what a failed request reads like: the API's own sentence
  // when it wrote one for a person, otherwise the message for its status class.
  return apiErrorMessage(error);
}

function dayNumber(value: string | number): number | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.floor(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) / 86_400_000);
}

function isStale(
  dataAsOf: string | null | undefined,
  now: number,
  freshWithinDays: number,
): boolean {
  if (!dataAsOf) return false;
  const then = dayNumber(dataAsOf);
  const today = dayNumber(now);
  if (then === null || today === null) return false;
  return today - then > freshWithinDays;
}

export function useDataState<T>(input: UseDataStateInput<T>): DataStateType {
  const { data, error, isLoading, dataAsOf } = input;
  const freshWithinDays = input.freshWithinDays ?? FRESH_WITHIN_DAYS;
  const hasData = input.hasData;

  const noData = data === null || data === undefined;
  if (noData) return resolveMissingState(isLoading, errorMessage(error));
  if (hasData && !hasData(data as T)) return "source-empty";
  if (isStale(dataAsOf, Date.now(), freshWithinDays)) return "stale";
  return "ready";
}

function resolveMissingState(
  isLoading: boolean | undefined,
  err: string | null,
): DataStateType {
  if (isLoading) return "loading";
  if (err !== null) return "source-error";
  return "source-empty";
}
