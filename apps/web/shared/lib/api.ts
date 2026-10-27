const API_BASE = "/api/v1";
const EXPECTED_API_VERSION = "1";

export const API_ERROR_KINDS = {
  unauthorized: "unauthorized",
  notFound: "not-found",
  conflict: "conflict",
  validation: "validation",
  rateLimited: "rate-limited",
  server: "server",
  request: "request",
} as const;

export type ApiErrorKind = (typeof API_ERROR_KINDS)[keyof typeof API_ERROR_KINDS];

export class ApiError extends Error {
  readonly name = "ApiError";

  constructor(
    readonly status: number,
    readonly detail: string,
    readonly kind: ApiErrorKind,
    readonly code: string | null = null,
    readonly requestId: string | null = null,
    readonly fields: readonly { readonly field: string; readonly message: string }[] = [],
  ) {
    super(detail);
  }
}

export class ApiContractError extends Error {
  readonly name = "ApiContractError";

  constructor(readonly detail: string) {
    super(detail);
  }
}

export type ApiRequestOptions = RequestInit & {
  readonly params?: Record<string, string>;
};

function errorKindForStatus(status: number): ApiErrorKind {
  if (status === 401 || status === 403) return API_ERROR_KINDS.unauthorized;
  if (status === 404) return API_ERROR_KINDS.notFound;
  if (status === 409) return API_ERROR_KINDS.conflict;
  if (status === 422) return API_ERROR_KINDS.validation;
  if (status === 429) return API_ERROR_KINDS.rateLimited;
  if (status >= 500) return API_ERROR_KINDS.server;
  return API_ERROR_KINDS.request;
}

type ApiErrorBody = {
  readonly error?: {
    readonly code?: unknown;
    readonly message?: unknown;
    readonly request_id?: unknown;
    readonly fields?: unknown;
  };
  readonly detail?: unknown;
  readonly message?: unknown;
};

function textField(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function fieldsFrom(error: ApiErrorBody["error"]): { field: string; message: string }[] {
  if (!error || !Array.isArray(error.fields)) return [];
  return error.fields.flatMap((entry) => {
    if (entry === null || typeof entry !== "object") return [];
    const field = textField((entry as { field?: unknown }).field);
    const message = textField((entry as { message?: unknown }).message);
    return field && message ? [{ field, message }] : [];
  });
}

/**
 * Read the API's error envelope.
 *
 * Every failure answers with `{error: {code, message, fields, request_id},
 * detail}`. `error.message` is the field written for a person and `detail` is
 * the same string kept for older callers; both are read so either shape yields
 * a usable message.
 */
export async function readApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.clone().json()) as ApiErrorBody;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  const message =
    textField(body?.error?.message) ?? textField(body?.detail) ?? textField(body?.message);
  return new ApiError(
    response.status,
    message ?? response.statusText,
    errorKindForStatus(response.status),
    textField(body?.error?.code),
    textField(body?.error?.request_id),
    fieldsFrom(body?.error),
  );
}

export function assertApiVersion(response: Response): void {
  const version = response.headers.get("X-API-Version");
  if (version !== EXPECTED_API_VERSION) {
    throw new ApiContractError(
      `Expected X-API-Version: ${EXPECTED_API_VERSION}, got: ${version ?? "<missing>"}`,
    );
  }
}

export function apiUrl(endpoint: string, params?: Record<string, string>): string {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const query = params ? new URLSearchParams(params).toString() : "";
  return `${API_BASE}${path}${query ? `?${query}` : ""}`;
}

export function apiDownloadUrl(endpoint: string, params: Record<string, string>): string {
  return apiUrl(endpoint, params);
}

/** Whether the API wrote this sentence for a person rather than for a log. */
function isUserFacing(message: string): boolean {
  return /[\u3400-\u9fff]/u.test(message);
}

const KIND_MESSAGE: Record<ApiErrorKind, string> = {
  [API_ERROR_KINDS.unauthorized]: "登录状态已失效，请重新登录。",
  [API_ERROR_KINDS.notFound]: "请求的数据不存在或已被移除。",
  [API_ERROR_KINDS.conflict]: "数据已发生变化，请刷新后重试。",
  [API_ERROR_KINDS.validation]: "提交的数据有误，请检查后重试。",
  [API_ERROR_KINDS.rateLimited]: "请求过于频繁，请稍后再试。",
  [API_ERROR_KINDS.server]: "服务暂时不可用，请稍后重试。",
  [API_ERROR_KINDS.request]: "请求未能完成，请稍后重试。",
};

/**
 * One failure → one sentence the interface can show.
 *
 * The API's own message wins when it was written for a person — the backend
 * knows which threshold is missing or which field the database refused, and a
 * canned sentence throws that away. Router details like `goal not found` are
 * identifiers rather than copy, so they fall back to the message for the status
 * class; that keeps the interface Chinese and still tells the reader what kind
 * of failure it was. `fallback` names the action that failed ("保存偏好设置失败")
 * for failures that carry no status at all, such as a bug in the page itself.
 */
export function apiErrorMessage(error: unknown, fallback?: string): string {
  if (error instanceof ApiContractError) {
    return "后端服务暂时不可达或响应异常，请检查后端服务状态或稍后重试。";
  }
  if (error instanceof ApiError) {
    if (isUserFacing(error.detail)) return error.detail;
    return KIND_MESSAGE[error.kind];
  }
  return fallback ?? "网络请求失败，请检查网络连接后重试。";
}

function requestHeaders(headers: HeadersInit | undefined, body: BodyInit | null | undefined): HeadersInit | undefined {
  if (body instanceof FormData || body instanceof URLSearchParams) return headers;
  return { "Content-Type": "application/json", ...headers };
}

async function requestJson<T>(
  endpoint: string,
  options: ApiRequestOptions,
  credentials: RequestCredentials,
): Promise<T> {
  const { params, headers, ...init } = options;
  let response: Response;
  try {
    response = await fetch(apiUrl(endpoint, params), {
      credentials,
      headers: requestHeaders(headers, init.body),
      ...init,
    });
  } catch {
    throw new ApiError(0, "网络请求失败", API_ERROR_KINDS.request);
  }
  if (!response.ok) throw await readApiError(response);
  assertApiVersion(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function apiFetch<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
  return requestJson<T>(endpoint, options, "include");
}

export function publicApiFetch<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
  return requestJson<T>(endpoint, options, "same-origin");
}
