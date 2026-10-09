"use client";

import useSWR from "swr";
import { apiFetch } from "@shared/lib/api";
import type { Shoe, ShoeAssignment, ShoeWithStats } from "@shared/types/gear";

export interface UseShoesResult {
  data: ShoeWithStats[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export interface UseShoeResult {
  data: ShoeWithStats | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export interface UseShoeMutations {
  create: (payload: {
    name: string;
    brand?: string | null;
    model?: string | null;
    purchase_date?: string | null;
    notes?: string | null;
  }) => Promise<Shoe | null>;
  update: (
    shoeId: string,
    payload: Partial<{
      name: string;
      brand: string | null;
      model: string | null;
      purchase_date: string | null;
      notes: string | null;
    }>,
  ) => Promise<Shoe | null>;
  retire: (shoeId: string) => Promise<boolean>;
  assign: (shoeId: string, activityId: string) => Promise<ShoeAssignment | null>;
  unassign: (shoeId: string, activityId: string) => Promise<boolean>;
}

/** Map API shoe response (id) to frontend Shoe shape (shoe_id). */
function mapShoe(raw: Record<string, unknown>): ShoeWithStats {
  const id = String(raw.id ?? raw.shoe_id ?? "");
  const mileage =
    typeof raw.mileage_m === "number"
      ? raw.mileage_m
      : typeof raw.current_mileage_m === "number"
        ? raw.current_mileage_m
        : 0;
  return {
    shoe_id: id,
    athlete_id: String(raw.athlete_id ?? ""),
    name: String(raw.name ?? ""),
    brand: (raw.brand as string | null) ?? null,
    model: (raw.model as string | null) ?? null,
    purchase_date: (raw.purchase_date as string | null) ?? null,
    current_mileage_m: mileage,
    retired_at: (raw.retired_at as string | null) ?? null,
    retirement_alert: Boolean(raw.retirement_alert),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? raw.created_at ?? ""),
    total_activities: typeof raw.total_activities === "number" ? raw.total_activities : 0,
    total_distance_m: mileage,
    last_used_at: (raw.last_used_at as string | null) ?? null,
  };
}

export function useShoes(): UseShoesResult {
  const { data, error, isLoading, mutate } = useSWR<ShoeWithStats[]>(
    ["/gear/shoes"],
    async () => {
      const rows = await apiFetch<Record<string, unknown>[]>("/gear/shoes");
      return (rows ?? []).map(mapShoe);
    },
  );
  return {
    data: data ?? [],
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : "加载跑鞋失败") : null,
    reload: () => void mutate(),
  };
}

export function useShoe(shoeId: string | null): UseShoeResult {
  const { data, error, isLoading, mutate } = useSWR<ShoeWithStats | null>(
    shoeId ? ["/gear/shoes", shoeId] : null,
    async () => {
      if (!shoeId) return null;
      const row = await apiFetch<Record<string, unknown>>(`/gear/shoes/${shoeId}`);
      return mapShoe(row);
    },
  );
  return {
    data: data ?? null,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : "加载跑鞋失败") : null,
    reload: () => void mutate(),
  };
}

export function useShoeMutations(): UseShoeMutations {
  return {
    async create(payload) {
      try {
        const row = await apiFetch<Record<string, unknown>>("/gear/shoes", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        return mapShoe(row);
      } catch {
        return null;
      }
    },
    async update(shoeId, payload) {
      try {
        const row = await apiFetch<Record<string, unknown>>(`/gear/shoes/${shoeId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        return mapShoe(row);
      } catch {
        return null;
      }
    },
    async retire(shoeId) {
      try {
        await apiFetch(`/gear/shoes/${shoeId}`, { method: "DELETE" });
        return true;
      } catch {
        return false;
      }
    },
    async assign(shoeId, activityId) {
      try {
        const row = await apiFetch<Record<string, unknown>>(
          `/gear/shoes/${shoeId}/assign`,
          {
            method: "POST",
            body: JSON.stringify({ activity_id: activityId }),
          },
        );
        return {
          assignment_id: String(row.id ?? ""),
          activity_id: String(row.activity_id ?? activityId),
          shoe_id: String(row.shoe_id ?? shoeId),
          distance_m: typeof row.distance_m === "number" ? row.distance_m : 0,
          created_at: String(row.assigned_at ?? row.created_at ?? ""),
        };
      } catch {
        return null;
      }
    },
    async unassign(shoeId, activityId) {
      try {
        await apiFetch(`/gear/shoes/${shoeId}/assign/${activityId}`, {
          method: "DELETE",
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}
