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

function detailFromBody(body: unknown, fallback: string): string {
  if (body !== null && typeof body === "object") {
    if ("detail" in body && typeof body.detail === "string") return body.detail;
    if ("message" in body && typeof body.message === "string") return body.message;
  }
  return fallback;
}

export async function readApiError(response: Response): Promise<ApiError> {
  let detail = response.statusText;
  try {
    detail = detailFromBody(await response.clone().json(), detail);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return new ApiError(response.status, detail, errorKindForStatus(response.status));
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

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiContractError) {
    return "后端服务暂时不可达或响应异常，请检查后端服务状态或稍后重试。";
  }
  if (!(error instanceof ApiError)) return "网络请求失败，请检查网络连接后重试。";

  switch (error.kind) {
    case API_ERROR_KINDS.unauthorized:
      return "登录状态已失效，请重新登录。";
    case API_ERROR_KINDS.notFound:
      return "请求的数据不存在或已被移除。";
    case API_ERROR_KINDS.conflict:
      return "数据已发生变化，请刷新后重试。";
    case API_ERROR_KINDS.validation:
      return "提交的数据有误，请检查后重试。";
    case API_ERROR_KINDS.rateLimited:
      return "请求过于频繁，请稍后再试。";
    case API_ERROR_KINDS.server:
      return "服务暂时不可用，请稍后重试。";
    case API_ERROR_KINDS.request:
      return "请求未能完成，请稍后重试。";
  }
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
  assertApiVersion(response);
  if (!response.ok) throw await readApiError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function apiFetch<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
  return requestJson<T>(endpoint, options, "include");
}

export function publicApiFetch<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
  return requestJson<T>(endpoint, options, "same-origin");
}
