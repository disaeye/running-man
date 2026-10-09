/**
 * Coerces a Zod-generated nullable-optional field (which may be
 * `T | undefined | null`) to the UI view-model shape `T | null`.
 *
 * Used by the Orval-adapter migration to normalize generated schema
 * outputs to the stable UI view types without widening component imports.
 */
export function nn<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

/**
 * Narrow a string to a literal union by checking against an explicit
 * allow-list. The allow-list must be a `readonly T[]` where the member
 * types are the literal union members; TypeScript then uses the list
 * element type (which matches the literal union) for the narrowed
 * return. Unrecognized values fall back to `fallback`.
 *
 * Implementation uses a `for-of` loop and `.includes`-style equality
 * check — no type assertion.
 */
export function narrowToLiteral<T extends string>(
  value: string | null | undefined,
  allowList: readonly T[],
  fallback: T,
): T {
  if (value === null || value === undefined) return fallback;
  for (const allowed of allowList) {
    if (allowed === value) return allowed;
  }
  return fallback;
}
