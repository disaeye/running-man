import type { ScopedMutator } from "swr";
import type { IntegrationSource } from "@features/data/hooks/useIntegrations";

function isTupleKey(key: unknown): key is readonly [string, ...unknown[]] {
  return Array.isArray(key) && typeof key[0] === "string";
}

function keyHead(key: unknown): string | null {
  if (typeof key === "string") return key;
  if (isTupleKey(key)) return key[0];
  return null;
}

/** Prefixes for product surfaces that depend on raw or derived training data. */
const DATA_DEPENDENT_PREFIXES = [
  "/data/health",
  "/data/quality",
  "/pmc",
  "/activities",
  "/activities/classifications",
  "/wellness",
  "/weight",
  "/metrics/series",
  "/calendar",
  "/goals",
  "/plan/active",
  "/plan/periodization",
  "/plan/revisions",
  "/plan/adjustments",
  "/strength",
  "/gear/shoes",
  "/notifications",
  "/insights/ability",
  "/insights/zones",
  "/insights/readiness",
  "/insights/coach-context",
  "/insights/weekly-progress",
  "/insights/plan-quality",
  "/insights/intensity-distribution",
  "/insights/personal-records",
  "/insights/athlete-grade",
  "/insights/personal-range",
  "training-consistency-from-activities",
] as const;

const TRAINING_PARAM_PREFIXES = [
  "/athletes/me",
  "/athletes/me/thresholds",
  "/athletes/me/physiology",
  "/insights/zones",
  "/insights/readiness",
  "/insights/intensity-distribution",
  "/insights/weekly-progress",
  "/insights/plan-quality",
  "/plan/active",
  "/insights/ability",
  "/insights/coach-context",
  "/pmc",
  "/activities",
  "/metrics/series",
  "/wellness",
] as const;

function matchesAnyPrefix(key: unknown, prefixes: readonly string[]): boolean {
  const head = keyHead(key);
  if (head === null) return false;
  return prefixes.some(
    (prefix) =>
      head === prefix || head.startsWith(`${prefix}/`) || head.startsWith(`${prefix}?`),
  );
}

function isDataDependentKey(key: unknown): boolean {
  return keyHead(key) === "sync-health-derived" || matchesAnyPrefix(key, DATA_DEPENDENT_PREFIXES);
}

function isSyncRunsKey(key: unknown, source?: string): boolean {
  const head = keyHead(key);
  if (head === null || !head.includes("/sync-runs")) return false;
  if (!source) return head.includes("/integrations/");
  return head.includes(`/integrations/${source}/`);
}

function isIntegrationKey(key: unknown, source?: string): boolean {
  const head = keyHead(key);
  if (head === null) return false;
  if (source) {
    const base = `/integrations/${source}`;
    return head === base || head.startsWith(`${base}/`) || head.startsWith(`${base}?`);
  }
  return head.startsWith("/integrations/");
}

/** Revalidate settings/data cards and home KPI surfaces after sync, connect, disconnect, or clear. */
export async function invalidateDataCards(
  mutate: ScopedMutator,
  source?: IntegrationSource | string,
): Promise<void> {
  const jobs: Array<Promise<unknown>> = [
    mutate(isDataDependentKey),
    mutate((key) => isSyncRunsKey(key, source)),
    mutate((key) => isIntegrationKey(key, source)),
  ];
  await Promise.all(jobs);
}

/** Revalidate derived VDOT, zone, ability, and coach cards after threshold/HR/profile edits. */
export async function invalidateTrainingParamDependents(mutate: ScopedMutator): Promise<void> {
  await mutate((key) => matchesAnyPrefix(key, TRAINING_PARAM_PREFIXES));
}

/** Revalidate goal, plan, calendar, and home insights after goal mutations or result recording. */
export async function invalidateGoalDependents(
  mutate: ScopedMutator,
  goalId?: string | null,
): Promise<void> {
  const prefixes = [
    "/goals",
    ...(goalId ? [`/goals/${goalId}`] : []),
    "/plan/active",
    "/plan/periodization",
    "/plan/revisions",
    "/plan/adjustments",
    "/calendar",
    "/insights/coach-context",
    "/insights/weekly-progress",
    "/insights/plan-quality",
    "/insights/personal-records",
    "/insights/athlete-grade",
    "/insights/ability",
  ];
  await mutate((key) => matchesAnyPrefix(key, prefixes));
}

/** Revalidate plan, calendar, and coaching insights after generating, adjusting, or editing workouts. */
export async function invalidatePlanDependents(
  mutate: ScopedMutator,
  goalId?: string | null,
): Promise<void> {
  const prefixes = [
    "/calendar",
    "/plan",
    "/goals",
    ...(goalId ? [`/goals/${goalId}`] : []),
    "/activities/classifications",
    "/insights/coach-context",
    "/insights/weekly-progress",
    "/insights/plan-quality",
    "/insights/readiness",
  ];
  await mutate((key) => matchesAnyPrefix(key, prefixes));
}

/** @deprecated prefer invalidateDataCards — kept as a named sync alias */
export async function invalidateAfterSync(
  mutate: ScopedMutator,
  source: IntegrationSource,
): Promise<void> {
  await invalidateDataCards(mutate, source);
}
