"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { User } from "lucide-react";
import { getCurrentUser, type UserProfile } from "@shared/lib/auth";
import { useClientDateLabel } from "@shared/lib/client-date";
import { ToastProvider } from "@shared/ui/Toast";
import { MobileTabBar } from "@shared/layout/TopTabBar";
import { Sidebar } from "@shared/layout/Sidebar";
import { ThemeToggle } from "@shared/ui/ThemeToggle";
import { getPageCopy } from "@shared/config/nav-config";
import { useSyncHealth, type SyncHealth } from "@features/data/hooks/useSyncHealth";

interface AppShellProps {
  children: React.ReactNode;
  onAvatarClick: () => void;
}

/**
 * Fixed responsive shell for all dashboard pages.
 *
 * Owns PC (sidebar) + mobile (bottom tab) layout, safe-area, content max-width,
 * and scroll region. Route pages should only render content inside a `.page-stack`
 * (or plain fragment) — no max-w / pb-24 / safe-area / dual-layout of their own.
 */
export function AppShell({ children, onAvatarClick }: AppShellProps) {
  // A failed profile fetch leaves `user` null and the avatar renders a neutral
  // placeholder. It used to substitute a hard-coded "耐力跑者" with invented
  // thresholds (HRmax 188 / LTHR 168 / threshold pace 4'20"), so an unreachable
  // API looked like a fully configured athlete.
  const [user, setUser] = useState<UserProfile | null>(null);
  const pathname = usePathname();
  const syncHealth = useSyncHealth();

  useEffect(() => {
    let mounted = true;
    getCurrentUser()
      .then((profile) => {
        if (mounted) setUser(profile);
      })
      .catch(() => {
        if (mounted) setUser(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Formatted on the client, in the athlete's timezone. Rendering
  // `new Date().toLocaleDateString()` directly made the server (UTC) and the
  // browser disagree for eight hours of every day, which React reports as
  // hydration error 418 on every dashboard page.
  const dateLabel = useClientDateLabel({
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const { title: pageTitle } = useMemo(() => getPageCopy(pathname), [pathname]);

  return (
    <ToastProvider>
      <a
        href="#main-content"
        className="focus-ring sr-only fixed left-4 top-4 z-50 rounded-full bg-primary px-4 py-2 text-subheadline font-semibold text-on-primary focus:not-sr-only"
      >
        跳到主要内容
      </a>

      <div data-shell="root" className="shell-atmosphere flex h-[100dvh] overflow-hidden text-text-primary">
        <div className="shell-orbs" aria-hidden="true" />
        <div className="shell-horizon" aria-hidden="true" />
        <div className="shell-grain" aria-hidden="true" />
        <div className="shell-chrome shell-chrome-row">
          <Sidebar />
          <div className="flex h-[calc(100dvh_-_var(--mobile-nav-height,0px))] min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:h-[100dvh]">
            <header
              data-shell-region="top"
              data-safe-area="top"
              className="glass-surface-strong shrink-0 border-b border-border-subtle pt-[env(safe-area-inset-top)]"
            >
              <div className="shell-header-inner">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="hidden h-6 w-px bg-border-default sm:block" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-caption1 uppercase tracking-[0.18em] text-text-muted">RUNNING MAN / {pageTitle}</p>
                    <p className="hidden truncate text-caption1 text-text-secondary sm:block">{dateLabel}</p>
                  </div>
                </div>
                <SyncStatusIndicator health={syncHealth} />
                <ThemeToggle />
                <ProfileButton user={user} onClick={onAvatarClick} />
              </div>
            </header>
            <main id="main-content" role="main" data-shell-region="main" className="shell-main">
              <div className="shell-main-inner">{children}</div>
              <div data-testid="content-end-sentinel" aria-hidden="true" className="h-px w-full" />
            </main>
          </div>
        </div>
        <MobileTabBar />
      </div>
    </ToastProvider>
  );
}

function SyncStatusIndicator({ health }: { health: SyncHealth }) {
  // Colour encodes the state and the label always says it in words, so the
  // indicator is not readable as "fine" when it is not.
  const tone: Record<SyncHealth["state"], string> = {
    ok: "bg-primary shadow-[0_0_12px_var(--color-primary)]",
    stale: "bg-warning",
    failing: "bg-error",
    not_connected: "bg-text-muted",
    unknown: "bg-text-muted",
  };
  const detail =
    health.state === "stale" && health.daysSinceData != null
      ? `（最新数据 ${health.daysSinceData} 天前）`
      : "";

  return (
    <div
      className="hidden items-center gap-2 text-caption1 text-text-muted lg:flex"
      aria-label="数据同步状态"
      data-testid="sync-status-indicator"
      data-sync-state={health.state}
    >
      <span className={`size-1.5 rounded-full ${tone[health.state]}`} aria-hidden="true" />
      <span className={health.state === "ok" ? undefined : "text-text-secondary"}>
        {health.label}
        {detail}
      </span>
    </div>
  );
}

function ProfileButton({
  user,
  onClick,
}: {
  user: UserProfile | null;
  onClick: () => void;
}) {
  const initials = profileInitials(user);

  return (
    <button
      type="button"
      data-testid="profile-button"
      onClick={onClick}
      className="focus-ring glass-surface flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold text-text-primary transition-transform duration-150 active:scale-90"
      aria-label="打开个人设置"
    >
      {initials ? (
        <span aria-hidden="true">{initials}</span>
      ) : (
        <User aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
      )}
    </button>
  );
}

export function profileInitials(user: UserProfile | null): string {
  const name = (user?.name || "").trim();
  if (!name) return "";
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "";
  if (parts.length >= 2) {
    const last = parts[parts.length - 1] ?? first;
    return (first.charAt(0) + last.charAt(0)).toUpperCase();
  }
  return first.charAt(0).toUpperCase();
}
