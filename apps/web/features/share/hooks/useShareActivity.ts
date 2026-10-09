"use client";

import { useEffect, useState } from "react";

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
}

export function useShareActivity(token: string): UseShareActivityResult {
  const [activity, setActivity] = useState<PublicActivity | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    publicApiFetch<PublicActivity>(`/share/${encodeURIComponent(token)}`)
      .then((data) => setActivity(data))
      .catch(setError);
  }, [token]);

  return { activity, error };
}
