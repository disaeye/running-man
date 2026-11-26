"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { register, login } from "@shared/lib/auth";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import {
  buildAuthSwitchHref,
  classifyAuthError,
  resolveSafeNextPath,
  type AuthErrorState,
} from "@features/auth/lib/auth-error";

const subscribeLocation = () => () => {};
const getLocationSearch = () => (typeof window === "undefined" ? "" : window.location.search);
const getServerLocationSearch = () => "";

export function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<AuthErrorState | null>(null);
  const [loading, setLoading] = useState(false);
  const search = useSyncExternalStore(subscribeLocation, getLocationSearch, getServerLocationSearch);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await register({ email, password, name, timezone });
      await login({ email, password });
      const nextTarget =
        typeof window !== "undefined" ? resolveSafeNextPath(window.location.search) : "/";
      window.location.assign(nextTarget);
    } catch (caught) {
      setError(classifyAuthError(caught, "register"));
    } finally {
      setLoading(false);
    }
  }

  const emailError = error?.field === "email" ? error : null;
  const passwordError = error?.field === "password" ? error : null;
  const formError = error?.field === "form" ? error : null;
  const loginHref = buildAuthSwitchHref("/login", search);
  const duplicateLoginHref = buildAuthSwitchHref("/login", search, email);

  return (
    <form onSubmit={handleSubmit} method="post" className="flex flex-col gap-4">
      <h1 className="text-title2 font-semibold text-text-primary">创建账号</h1>

      <label className="flex flex-col gap-1.5">
        <span className="text-caption1 text-text-muted">名字</span>
        <Input
          name="name"
          type="text"
          placeholder="你的名字"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoComplete="name"
          data-testid="register-name"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-caption1 text-text-muted">邮箱</span>
        <Input
          name="email"
          type="email"
          placeholder="name@domain.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          aria-invalid={emailError != null}
          aria-describedby={emailError ? "register-email-error" : undefined}
          data-testid="register-email"
        />
        {emailError && (
          <span id="register-email-error" className="text-caption1 text-error" role="alert">
            {emailError.message}
            {emailError.hint && (
              <span className="mt-0.5 block text-text-muted">
                {emailError.hint}{" "}
                <Link
                  href={duplicateLoginHref}
                  className="text-accent-strong underline underline-offset-4"
                >
                  去登录
                </Link>
              </span>
            )}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-caption1 text-text-muted">密码</span>
        <div className="relative">
          <Input
            id="register-password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="至少 8 位"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            aria-invalid={passwordError != null}
            aria-describedby={passwordError ? "register-password-error" : undefined}
            data-testid="register-password"
            className="pr-12"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={showPassword ? "隐藏密码" : "显示密码"}
            aria-pressed={showPassword}
            aria-controls="register-password"
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute right-0 top-0 text-text-muted"
          >
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        </div>
        {passwordError && (
          <span id="register-password-error" className="text-caption1 text-error" role="alert">
            {passwordError.message}
            {passwordError.hint && (
              <span className="mt-0.5 block text-text-muted">{passwordError.hint}</span>
            )}
          </span>
        )}
      </label>

      {formError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-error/30 bg-error/5 p-3 text-subheadline text-error"
          data-testid="register-error"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="flex-1 space-y-1">
            <p className="font-medium leading-snug">{formError.message}</p>
            {formError.hint && <p className="text-caption1 text-text-muted">{formError.hint}</p>}
          </div>
        </div>
      )}

      <Button type="submit" className="mt-1 w-full rounded-full" disabled={loading}>
        {loading ? "创建中…" : "创建账号"}
      </Button>

      <p className="text-center text-caption1 text-text-muted">
        已有账号？{" "}
        <Link href={loginHref} className="text-accent-strong underline underline-offset-4">
          登录
        </Link>
      </p>
    </form>
  );
}
