import { apiErrorMessage } from "@shared/lib/api";

export type AuthField = "email" | "password" | "form";

export interface AuthErrorState {
  /** Where the message belongs: under a field, or above the submit button. */
  readonly field: AuthField;
  readonly message: string;
  readonly hint?: string;
}

const RATE_LIMIT = /rate|too many|频繁|稍后|429/i;
const DUPLICATE = /exists|duplicate|already|已存在|已注册|重复|409/i;
const CREDENTIALS = /invalid|credential|password|邮箱|密码|401/i;
const BACKEND = /后端服务|network|failed to fetch|连接/i;

/**
 * Turns a failed sign-in or registration into a message that names the problem
 * and the field it belongs to. Anything unrecognised stays a form-level error
 * with the original text rather than being rewritten into a guess.
 */
export function classifyAuthError(
  caught: unknown,
  mode: "login" | "register",
): AuthErrorState {
  const raw = apiErrorMessage(caught);

  if (RATE_LIMIT.test(raw)) {
    return {
      field: "password",
      message: "尝试次数过多，请稍后再试。",
      hint: "连续失败会触发限流，等待几分钟后再登录。",
    };
  }
  if (mode === "register" && DUPLICATE.test(raw)) {
    return {
      field: "email",
      message: "这个邮箱已经注册过。",
      hint: "直接用这个邮箱登录即可。",
    };
  }
  if (mode === "login" && CREDENTIALS.test(raw)) {
    return { field: "password", message: "邮箱或密码不正确。" };
  }
  if (BACKEND.test(raw)) {
    return {
      field: "form",
      message: raw,
      hint: "请确认后端 API（API_URL）正在运行。",
    };
  }
  return { field: "form", message: raw };
}

/** Validate `next` redirect target so only same-origin relative paths are accepted. */
export function resolveSafeNextPath(search: string): string {
  const raw = new URLSearchParams(search).get("next") ?? "";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

/** Build `/login` or `/register` href preserving safe `next` (and optional `email`). */
export function buildAuthSwitchHref(
  targetPath: "/login" | "/register",
  search: string,
  email?: string,
): string {
  const params = new URLSearchParams();
  const nextPath = resolveSafeNextPath(search);
  if (nextPath !== "/") params.set("next", nextPath);
  if (email?.trim()) params.set("email", email.trim());
  const qs = params.toString();
  return qs ? `${targetPath}?${qs}` : targetPath;
}
