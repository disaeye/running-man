"use client";

import { ToastProvider } from "@shared/ui/Toast";
import { MobileTabBar } from "@shared/layout/TopTabBar";
import { usePathname } from "next/navigation";
import { NAV_ENTRIES } from "@shared/config/nav-config";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  return (
    <ToastProvider>
      <a
        href="#main-content"
        className="focus-ring sr-only fixed left-4 top-4 z-50 rounded-full bg-primary px-4 py-2 text-on-primary focus:not-sr-only"
      >
        跳到主要内容
      </a>
      <div data-shell="root" className="min-h-dvh bg-surface-sunken text-text-primary">
        <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 pt-5">
          <span className="font-display text-xl font-bold tracking-wide text-accent">步迹</span>
          <span className="text-caption1 text-text-muted">
            {NAV_ENTRIES.find((entry) => entry.href === pathname)?.label ?? "训练记录"}
          </span>
        </header>
        <main id="main-content" role="main" data-shell-region="main">
          {children}
          <div data-testid="content-end-sentinel" aria-hidden="true" className="h-px w-full" />
        </main>
        <MobileTabBar />
      </div>
    </ToastProvider>
  );
}
