"use client";

import { useState, type FormEvent } from "react";
import { LogIn, AlertCircle } from "lucide-react";
import { login } from "@shared/lib/auth";
import { apiErrorMessage } from "@shared/lib/api";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import Link from "next/link";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);

    try {
      await login({ email, password });
      const nextTarget =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next") || "/"
          : "/";
      window.location.assign(nextTarget);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    // `method="post"` guards the pre-hydration window. Until React attaches the
    // submit handler the browser's default for a form with no method is GET, so
    // a click in that window would put the password in the URL — into browser
    // history, server logs, and the Referer of the next request. Observed with a
    // Playwright click that landed before hydration finished.
    <form onSubmit={handleSubmit} method="post" className="flex flex-col gap-5">
      <div className="border-b border-border-subtle pb-5"><p className="font-mono text-caption2 uppercase tracking-[0.2em] text-primary">ACCESS / 01</p><h2 className="mt-3 text-display-sm text-text-primary">回到训练现场</h2><p className="mt-2 text-subheadline text-text-secondary">登录你的 Running Man 训练操作系统。</p></div>
      <label className="flex flex-col gap-2"><span className="font-mono text-caption2 uppercase tracking-[0.16em] text-text-muted">Email</span><Input name="email" type="email" placeholder="name@domain.com" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" data-testid="login-email" /></label>
      <label className="flex flex-col gap-2"><span className="font-mono text-caption2 uppercase tracking-[0.16em] text-text-muted">Password</span><Input name="password" type="password" placeholder="至少 8 位" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="current-password" data-testid="login-password" /></label>
      {error && <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-error/30 bg-error/10 p-3 text-subheadline text-error" data-testid="login-error"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><div className="flex-1 space-y-1"><p className="font-medium leading-snug">{error}</p>{error.includes("后端服务") && <p className="text-caption1 text-text-muted">请确认后端 API（API_URL）正在运行。</p>}</div></div>}
      <Button type="submit" className="mt-2 w-full" disabled={loading}><LogIn className="size-4" aria-hidden="true" />{loading ? "登录中…" : "进入系统"}</Button>
      <p className="text-center text-subheadline text-text-secondary">还没有账号？ <Link href="/register" className="text-accent-strong underline underline-offset-4">创建运动档案</Link></p>
    </form>
  );
}
