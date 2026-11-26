"use client";

import { useCallback, useEffect, useState } from "react";

import { publicApiFetch } from "@shared/lib/api";

export interface PublicActivity {
  readonly sport: string;
  readonly date: string;
  readonly duration_s: number | null;
  readonly distance_m: number | null;
  readonly name: string | null;
  readonly avg_hr: number | null;
  readonly elevation_gain_m: number | null;
}

export interface UseShareActivityResult {
  readonly activity: PublicActivity | null;
  readonly error: unknown;
  readonly reload: () => void;
}

export function useShareActivity(token: string): UseShareActivityResult {
  const [activity, setActivity] = useState<PublicActivity | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    publicApiFetch<PublicActivity>(`/share/${encodeURIComponent(token)}`)
      .then((data) => {
        if (!active) return;
        setError(null);
        setActivity(data);
      })
      .catch((cause) => {
        if (active) setError(cause);
      });
    return () => {
      active = false;
    };
  }, [token, attempt]);

  return { activity, error, reload };
}
