"use client";

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

/** Threshold beyond which `dataAsOf` is considered stale. 48h by default. */
export const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

/** Canonical Chinese labels for data display states (single source of truth). */
export const LOADING_LABEL = "加载中...";
export const EMPTY_LABEL = "暂无数据";
export const ERROR_LABEL = "加载失败";

export interface UseDataStateInput<T> {
  data: T | null | undefined;
  error?: unknown;
  isLoading?: boolean;
  dataAsOf?: string | null;
  /** Override the staleness threshold (ms). */
  staleThresholdMs?: number;
  /**
   * Predicate deciding whether a non-null `data` actually has rows worth
   * showing. Defaults to "any non-null value is data".
   */
  hasData?: (v: T) => boolean;
}

function errorMessage(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

function isStale(
  dataAsOf: string | null | undefined,
  now: number,
  thresholdMs: number,
): boolean {
  if (!dataAsOf) return false;
  const ts = new Date(dataAsOf).getTime();
  if (Number.isNaN(ts)) return false;
  return now - ts > thresholdMs;
}

export function useDataState<T>(input: UseDataStateInput<T>): DataStateType {
  const { data, error, isLoading, dataAsOf } = input;
  const thresholdMs = input.staleThresholdMs ?? STALE_THRESHOLD_MS;
  const hasData = input.hasData;

  const noData = data === null || data === undefined;
  if (noData) return resolveMissingState(isLoading, errorMessage(error));
  if (hasData && !hasData(data as T)) return "source-empty";
  if (isStale(dataAsOf, Date.now(), thresholdMs)) return "stale";
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
