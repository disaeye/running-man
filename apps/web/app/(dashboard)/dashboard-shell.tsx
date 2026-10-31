"use client";

import { AppShell } from "@shared/layout/AppShell";
import { SWRProvider } from "@shared/lib/swr-provider";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <SWRProvider>
      <AppShell>{children}</AppShell>
    </SWRProvider>
  );
}
