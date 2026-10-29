"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@shared/layout/AppShell";
import { SWRProvider } from "@shared/lib/swr-provider";
import { useCoachContext } from "@features/today/hooks/useCoachContext";
import { athleteWeekRange, useAthleteTimezone } from "@shared/lib/training-day";
import { isoWeek } from "@features/calendar/lib/build-week-summary";

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const timezone = useAthleteTimezone();
  const coachQuery = useCoachContext();
  const weekRange = useMemo(() => athleteWeekRange(timezone), [timezone]);
  const weekStart = useMemo(() => new Date(`${weekRange.from}T00:00:00`), [weekRange.from]);
  const weekNumber = isoWeek(weekStart).week;

  const ctl = coachQuery.data?.recent_load?.current_ctl ?? null;
  const tsb = coachQuery.data?.recent_load?.current_tsb ?? null;

  return (
    <AppShell
      athleteInfo={{
        weekLabel: `第 ${weekNumber} 周`,
        ctl: ctl !== null ? Math.round(ctl) : null,
        tsb: tsb !== null ? Math.round(tsb) : null,
      }}
      onAvatarClick={() => router.push("/settings?section=account")}
    >
      {children}
    </AppShell>
  );
}

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
      <DashboardShellInner>{children}</DashboardShellInner>
    </SWRProvider>
  );
}
