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
  "/wellness",
  "/calendar",
  "/goals",
  "/insights/readiness",
  "/insights/coach-context",
  "/insights/weekly-progress",
  "/insights/plan-quality",
  "/insights/intensity-distribution",
  "/insights/personal-records",
  "/recommendations",
] as const;

function isDataDependentKey(key: unknown): boolean {
  const head = keyHead(key);
  if (head === null) return false;
  return DATA_DEPENDENT_PREFIXES.some(
    (prefix) =>
      head === prefix || head.startsWith(`${prefix}/`) || head.startsWith(`${prefix}?`),
  );
}

function isSyncRunsKey(key: unknown, source?: string): boolean {
  const head = keyHead(key);
  if (head === null || !head.includes("/sync-runs")) return false;
  if (!source) return head.includes("/integrations/");
  return head.includes(`/integrations/${source}/`);
}

function isIntegrationKey(key: unknown, source?: string): boolean {
  if (source) {
    return (
      (isTupleKey(key) && key[0] === `/integrations/${source}`) ||
      keyHead(key) === `/integrations/${source}`
    );
  }
  const head = keyHead(key);
  return head !== null && head.startsWith("/integrations/");
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

/** @deprecated prefer invalidateDataCards — kept as a named sync alias */
export async function invalidateAfterSync(
  mutate: ScopedMutator,
  source: IntegrationSource,
): Promise<void> {
  await invalidateDataCards(mutate, source);
}
