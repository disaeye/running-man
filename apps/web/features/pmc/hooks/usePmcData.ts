"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getPmcApiV1PmcGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";
import { nn } from "@shared/lib/dto-nullable";

export interface PmcPoint {
  day: string;
  ctl: number;
  atl: number;
  tsb: number;
  tss: number;
  acwr: number | null;
}

interface UsePmcDataResult {
  data: PmcPoint[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const PmcPointView = Generated.PmcPointResponse.pick({
  day: true,
  ctl: true,
  atl: true,
  tsb: true,
  tss: true,
  acwr: true,
});

type PmcViewInput = z.input<typeof PmcPointView>;

function mapPmcPoint(row: PmcViewInput): PmcPoint {
  return {
    day: row.day,
    ctl: row.ctl,
    atl: row.atl,
    tsb: row.tsb,
    tss: row.tss,
    acwr: nn(row.acwr),
  };
}

export function usePmcData(from: string, to: string): UsePmcDataResult {
  const params = { from, to };
  const { data, error, isLoading, mutate } = useSWR<PmcPoint[]>(
    ["/pmc", params],
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => getPmcApiV1PmcGet(params, {}, f),
          z.array(PmcPointView),
        ).then((rows) => rows.map(mapPmcPoint)),
    },
  );

  return {
    data: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    reload: () => void mutate(),
  };
}
