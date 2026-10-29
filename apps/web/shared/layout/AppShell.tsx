"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { User } from "lucide-react";
import { getCurrentUser, type UserProfile } from "@shared/lib/auth";
import { ToastProvider } from "@shared/ui/Toast";
import { MobileTabBar } from "@shared/layout/TopTabBar";
import { Sidebar, type SidebarAthleteInfo } from "@shared/layout/Sidebar";
import { useSyncHealth, type SyncHealth } from "@features/data/hooks/useSyncHealth";

interface AppShellProps {
  children: React.ReactNode;
  athleteInfo?: SidebarAthleteInfo;
  onAvatarClick: () => void;
}

/**
 * Fixed responsive shell for all dashboard pages.
 *
 * Owns PC (sidebar) + mobile (bottom tab) layout, safe-area, content max-width,
 * and scroll region. Route pages should only render content inside a `.page-stack`
 * (or plain fragment) — no max-w / pb-24 / safe-area / dual-layout of their own.
 *
 * The bar carries the sync state and the account settings entry while the page's own
 * title is on screen; once that title scrolls away the bar takes it over.
 */
export function AppShell({ children, athleteInfo, onAvatarClick }: AppShellProps) {
  // A failed profile fetch leaves `user` null and the avatar renders a neutral
  // placeholder. It used to substitute a hard-coded "耐力跑者" with invented
  // thresholds (HRmax 188 / LTHR 168 / threshold pace 4'20"), so an unreachable
  // API looked like a fully configured athlete.
  const [user, setUser] = useState<UserProfile | null>(null);
  const [compactTitle, setCompactTitle] = useState<string | null>(null);
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

  // The page's own title is the large title in the content; once it scrolls out
  // of view the bar carries the same words, which is how a phone keeps the
  // screen identifiable without repeating the heading. Client pages render their
  // heading after mount, so the observer attaches when it appears.
  useEffect(() => {
    const main = document.querySelector<HTMLElement>('[data-shell-region="main"]');
    if (!main) return;

    let observer: IntersectionObserver | null = null;
    let heading: HTMLElement | null = null;

    const attach = () => {
      const next = main.querySelector<HTMLElement>("[data-page-title]");
      if (!next || next === heading) return;
      observer?.disconnect();
      heading = next;
      observer = new IntersectionObserver(
        ([entry]) => setCompactTitle(entry?.isIntersecting ? null : next.textContent),
        { root: main, threshold: 0, rootMargin: "-8px 0px 0px 0px" },
      );
      observer.observe(next);
    };

    attach();
    const mutations = new MutationObserver(attach);
    mutations.observe(main, { childList: true, subtree: true });

    return () => {
      observer?.disconnect();
      mutations.disconnect();
    };
  }, [pathname]);

  return (
    <ToastProvider>
      <a
        href="#main-content"
        className="focus-ring sr-only fixed left-4 top-4 z-50 rounded-full bg-primary px-4 py-2 text-subheadline font-semibold text-on-primary focus:not-sr-only"
      >
        跳到主要内容
      </a>

      <div data-shell="root" className="shell-atmosphere flex h-[100dvh] overflow-hidden text-text-primary">
        <div className="shell-chrome shell-chrome-row">
          <Sidebar athleteName={user?.name} athleteInfo={athleteInfo} />
          <div className="flex h-[calc(100dvh_-_var(--mobile-nav-height,0px))] min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:h-[100dvh]">
            <header
              data-shell-region="top"
              data-safe-area="top"
              className="shrink-0 border-b border-border-subtle bg-surface-base pt-[env(safe-area-inset-top)]"
            >
              <div className="shell-header-inner">
                <p
                  className="min-w-0 flex-1 truncate text-subheadline font-semibold text-text-primary"
                  data-testid="compact-title"
                >
                  {compactTitle ?? ""}
                </p>
                <SyncStatusIndicator health={syncHealth} compact={compactTitle !== null} />
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

function SyncStatusIndicator({ health, compact }: { health: SyncHealth; compact: boolean }) {
  // Colour marks trouble, words carry facts. A quiet week with a healthy sync
  // chain is not trouble, so only a failed attempt earns the red dot.
  const tone: Record<SyncHealth["state"], string> = {
    ok: "bg-primary",
    stale: "bg-text-muted",
    empty: "bg-text-muted",
    failing: "bg-error",
    not_connected: "bg-text-muted",
    unknown: "bg-text-muted",
  };
  // Once the bar carries the page title there is no room for a second sentence;
  // the dot keeps the state readable.
  return (
    <div
      className="flex shrink-0 items-center gap-2 text-caption1 text-text-muted"
      aria-label="数据同步状态"
      data-testid="sync-status-indicator"
      data-sync-state={health.state}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${tone[health.state]}`} aria-hidden="true" />
      <span
        className={`truncate ${health.state === "ok" ? "" : "text-text-secondary"} ${
          compact ? "hidden" : ""
        }`}
      >
        {health.label}
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
      className="focus-ring flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-rail text-caption1 font-semibold text-accent-strong transition-transform duration-150 active:scale-95"
      aria-label="打开设置"
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
