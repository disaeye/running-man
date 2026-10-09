import type { ZodType } from "zod";
import { runtimeFetch } from "./transport";

type FetchFn = typeof globalThis.fetch;

/**
 * Invoke a generated Orval operation with `runtimeFetch` injected.
 * The thunk receives a typed `FetchFn` and returns whatever the
 * generated operation returns (a typed envelope). `runtimeFetch` raises
 * `ApiError`/`ContractError` on non-OK responses or missing API-version
 * header, so the thunk resolves only on success paths.
 */
export async function callOrval<E extends { data: unknown; status: number; headers: Headers }>(
  thunk: (fetchFn: FetchFn) => Promise<E>,
): Promise<E> {
  return thunk(runtimeFetch);
}

/**
 * Invoke a generated Orval operation with `runtimeFetch` injected AND
 * run a Zod schema over the success data. Use for list endpoints or
 * any case where the caller needs a narrow runtime-validated type.
 * The schema parses the raw body (even if the generated op already
 * parsed it — idempotent for identical schemas).
 */
export async function callOrvalValidated<O>(
  thunk: (fetchFn: FetchFn) => Promise<{ data: unknown }>,
  schema: ZodType<O>,
): Promise<O> {
  const { data } = await thunk(runtimeFetch);
  return schema.parse(data);
}
