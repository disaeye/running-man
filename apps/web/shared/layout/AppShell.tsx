"use client";

import { ToastProvider } from "@shared/ui/Toast";
import { MobileTabBar } from "@shared/layout/TopTabBar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <ToastProvider>
      <a
        href="#main-content"
        className="focus-ring sr-only fixed left-4 top-4 z-50 rounded-full bg-primary px-4 py-2 text-on-primary focus:not-sr-only"
      >
        跳到主要内容
      </a>
      <div data-shell="root" className="min-h-dvh bg-surface-sunken text-text-primary">
        <main id="main-content" role="main" data-shell-region="main" className="pb-[calc(var(--mobile-nav-height,64px)+env(safe-area-inset-bottom))]">
          <div className="shell-main-inner">{children}</div>
          <div data-testid="content-end-sentinel" aria-hidden="true" className="h-px w-full" />
        </main>
        <MobileTabBar />
      </div>
    </ToastProvider>
  );
}
