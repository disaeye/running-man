"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { login } from "@shared/lib/auth";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { classifyAuthError, type AuthErrorState } from "@features/auth/lib/auth-error";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<AuthErrorState | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setAuthError(null);
    setLoading(true);

    try {
      await login({ email, password });
      const nextTarget =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next") || "/"
          : "/";
      window.location.assign(nextTarget);
    } catch (caught) {
      setAuthError(classifyAuthError(caught, "login"));
    } finally {
      setLoading(false);
    }
  }

  const emailError = authError?.field === "email" ? authError : null;
  const passwordError = authError?.field === "password" ? authError : null;
  const formError = authError?.field === "form" ? authError : null;

  return (
    // `method="post"` guards the pre-hydration window. Until React attaches the
    // submit handler the browser's default for a form with no method is GET, so
    // a click in that window would put the password in the URL.
    <form onSubmit={handleSubmit} method="post" className="flex flex-col gap-4">
      <h1 className="text-title2 font-semibold text-text-primary">登录</h1>

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
          aria-describedby={emailError ? "login-email-error" : undefined}
          data-testid="login-email"
        />
        {emailError && (
          <span id="login-email-error" className="text-caption1 text-error" role="alert">
            {emailError.message}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-caption1 text-text-muted">密码</span>
        <Input
          name="password"
          type="password"
          placeholder="至少 8 位"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
          autoComplete="current-password"
          aria-invalid={passwordError != null}
          aria-describedby={passwordError ? "login-password-error" : undefined}
          data-testid="login-password"
        />
        {passwordError && (
          <span id="login-password-error" className="text-caption1 text-error" role="alert">
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
          data-testid="login-error"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="flex-1 space-y-1">
            <p className="font-medium leading-snug">{formError.message}</p>
            {formError.hint && <p className="text-caption1 text-text-muted">{formError.hint}</p>}
          </div>
        </div>
      )}

      <Button type="submit" className="mt-1 w-full rounded-full" disabled={loading}>
        {loading ? "登录中…" : "登录"}
      </Button>

      <p className="text-center text-caption1 text-text-muted">
        还没有账号？{" "}
        <Link href="/register" className="text-accent-strong underline underline-offset-4">
          创建账号
        </Link>
      </p>
    </form>
  );
}
