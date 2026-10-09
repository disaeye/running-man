"use client";

import { AppShell } from "@shared/layout/AppShell";
import { SWRProvider } from "@shared/lib/swr-provider";

/**
 * Client-side wrapper for the dashboard.
 *
 * Split from `layout.tsx` so that file can stay a server component and export
 * `metadata` — Next.js disallows that export from a `"use client"` module. The
 * split is purely about that constraint: all of the behaviour (SWR cache,
 * navigation shell, avatar navigation event) belongs to the client.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <SWRProvider>
      <AppShell
        onAvatarClick={() => {
          window.dispatchEvent(new CustomEvent("navigate-settings"));
        }}
      >
        {children}
      </AppShell>
    </SWRProvider>
  );
}
