"use client";

import useSWR from "swr";
import type { UserProfile } from "@shared/lib/auth";

interface UseProfileResult {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useProfile(): UseProfileResult {
  const { data, error, isLoading, mutate } = useSWR<UserProfile>([
    "/athletes/me",
    {},
  ]);
  const reload = () => void mutate();

  return { profile: data ?? null, loading: isLoading, error: error?.message ?? null, reload };
}

interface ZoneData {
  ftp: number | null;
  hr_max: number | null;
  hr_zones: Zone[];
  power_zones: Zone[] | null;
}

interface Zone {
  zone: number;
  name: string;
  min_pct: number;
  max_pct: number | null;
  min_value: number;
  max_value: number | null;
}

interface UseZonesResult {
  zones: ZoneData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useZones(): UseZonesResult {
  const { data, error, isLoading, mutate } = useSWR<ZoneData>([
    "/insights/zones",
    {},
  ]);
  const reload = () => void mutate();

  return { zones: data ?? null, loading: isLoading, error: error?.message ?? null, reload };
}
