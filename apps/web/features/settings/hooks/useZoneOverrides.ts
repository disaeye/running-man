"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { callOrval, callOrvalValidated } from "@shared/api/orval-adapter";
import {
  getZonesApiV1InsightsZonesGet,
  putZonesApiV1InsightsZonesPut,
  deleteZonesApiV1InsightsZonesDelete,
  putHrSchemeApiV1InsightsZonesSchemePut,
} from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import type { ZoneSchemeOption } from "@features/settings/components/HrSchemePicker";

/**
 * Heart rate zone scheme selection.
 *
 * The zone count is fixed at five for every scheme; only the boundaries move.
 * That is why `hr_scheme` exists and why the response carries the resolved
 * thresholds and a citation: the client must be able to show *what* the
 * percentages were taken of, and which fields a scheme still needs.
 *
 * `hr_max_estimated` marks an age-predicted HRmax. Tanaka et al. (2001) report
 * a residual SD of 7-11 bpm, so an estimate is presented as an estimate and a
 * measured value always takes precedence.
 */
export type HrScheme = "hrmax" | "lthr" | "karvonen";

export interface Zone {
  zone: number;
  name: string;
  min_pct: number;
  max_pct: number | null;
  min_value: number;
  max_value: number | null;
}

export interface ZoneOverride {
  zone: number;
  min_pct: number;
  max_pct: number | null;
}

export interface ZonesResponseView {
  hr_max: number | null;
  hr_max_estimated: boolean;
  hr_max_source: string | null;
  lthr: number | null;
  resting_hr: number | null;
  threshold_pace: number | null;
  hr_scheme: HrScheme;
  hr_scheme_label: string;
  hr_scheme_citation: string | null;
  hr_scheme_options: ZoneSchemeOption[];
  /** Fields the selected scheme still needs; empty when `hr_zones` is populated. */
  unavailable_requirements: string[];
  has_overrides: boolean;
  hr_zones: Zone[];
  pace_zones: Zone[] | null;
}

export interface UseZoneOverridesResult {
  zones: ZonesResponseView | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  saveOverrides: (overrides: ZoneOverride[]) => Promise<boolean>;
  resetZones: () => Promise<boolean>;
  selectScheme: (scheme: HrScheme) => Promise<boolean>;
  reload: () => void;
}

function parseScheme(value: string): HrScheme {
  switch (value) {
    case "lthr":
    case "karvonen":
    case "hrmax":
      return value;
    default:
      // Unknown or removed schemes fall back to the default rather than
      // leaving the picker with nothing selected. "custom" is not a scheme:
      // manual boundaries overlay a computed one via zone_overrides.
      return "hrmax";
  }
}

function mapZonesResponse(raw: Generated.ZonesResponseOutput): ZonesResponseView {
  return {
    hr_max: raw.hr_max,
    hr_max_estimated: raw.hr_max_estimated ?? false,
    hr_max_source: raw.hr_max_source ?? null,
    lthr: raw.lthr ?? null,
    resting_hr: raw.resting_hr ?? null,
    threshold_pace: raw.threshold_pace ?? null,
    hr_scheme: parseScheme(raw.hr_scheme),
    hr_scheme_label: raw.hr_scheme_label,
    hr_scheme_citation: raw.hr_scheme_citation ?? null,
    hr_scheme_options: (raw.hr_schemes ?? []).map((o) => ({
      key: parseScheme(o.key),
      label: o.label,
      reference: o.reference,
      citation: o.citation ?? null,
      available: o.available ?? true,
      missing: [...(o.missing ?? [])],
    })),
    unavailable_requirements: [...(raw.unavailable_requirements ?? [])],
    has_overrides: raw.has_overrides ?? false,
    hr_zones: raw.hr_zones,
    pace_zones: raw.pace_zones ?? null,
  };
}

export function useZoneOverrides(): UseZoneOverridesResult {
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const { data, error, isLoading, mutate } = useSWR<ZonesResponseView>(
    ["/insights/zones", {}],
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => getZonesApiV1InsightsZonesGet({}, f),
          Generated.ZonesResponse,
        ).then(mapZonesResponse),
    },
  );
  const zones = data ?? null;
  const reload = () => void mutate();

  const saveOverrides = useCallback(
    async (overrides: ZoneOverride[]): Promise<boolean> => {
      setSaving(true);
      setMutationError(null);
      try {
        const body: Generated.ZoneOverrideUpdate = {
          metric: "hr",
          overrides: overrides.map((o) => ({
            zone: o.zone,
            min_pct: o.min_pct,
            max_pct: o.max_pct ?? o.min_pct,
          })),
        };
        await callOrval((f) => putZonesApiV1InsightsZonesPut(body, {}, f));
        await mutate();
        return true;
      } catch (err: unknown) {
        setMutationError(err instanceof Error ? err.message : "保存失败");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [mutate],
  );

  const resetZones = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setMutationError(null);
    try {
      await callOrval((f) => deleteZonesApiV1InsightsZonesDelete({}, f));
      await mutate();
      return true;
    } catch (err: unknown) {
      setMutationError(err instanceof Error ? err.message : "恢复失败");
      return false;
    } finally {
      setSaving(false);
    }
  }, [mutate]);

  const selectScheme = useCallback(
    async (scheme: HrScheme): Promise<boolean> => {
      setSaving(true);
      setMutationError(null);
      try {
        await callOrval((f) =>
          putHrSchemeApiV1InsightsZonesSchemePut({ hr_scheme: scheme }, {}, f),
        );
        await mutate();
        return true;
      } catch (err: unknown) {
        // The API rejects a scheme whose thresholds are missing and names the
        // field in the message; surface that rather than a generic failure.
        setMutationError(err instanceof Error ? err.message : "切换方案失败");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [mutate],
  );

  return {
    zones,
    loading: isLoading,
    saving,
    error: mutationError ?? error?.message ?? null,
    saveOverrides,
    resetZones,
    selectScheme,
    reload,
  };
}
