"use client";

import useSWR from "swr";
import type { StreamPoint } from "@shared/types/activity";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getStreamsApiV1ActivitiesActivityIdStreamsGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import { z } from "zod";
import { nn } from "@shared/lib/dto-nullable";

export function useActivityStreams(id: string | undefined) {
  const { data, error, isLoading } = useSWR<StreamPoint[]>(
    id ? [`/activities/${id}/streams`, {}] : null,
    {
      fetcher: async () => {
        if (!id) throw new Error("SWR guard: id required");
        return callOrvalValidated(
          (f) => getStreamsApiV1ActivitiesActivityIdStreamsGet(id, {}, f),
          z.array(Generated.StreamPoint),
        ).then((rows) => rows.map(mapStreamPoint));
      },
    },
  );

  return {
    data: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
  };
}

function mapStreamPoint(row: Generated.StreamPointOutput): StreamPoint {
  return {
    sample_time: row.sample_time,
    metric_type: row.metric_type,
    value: row.value,
    lat: nn(row.lat),
    lon: nn(row.lon),
    alt: nn(row.alt),
  };
}
