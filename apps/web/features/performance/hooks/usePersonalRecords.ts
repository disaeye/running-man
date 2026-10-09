"use client";

import useSWR from "swr";
import { z } from "zod";
import type { PersonalRecord } from "@features/performance/components/PerformancePRs";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { getPersonalRecordsApiV1InsightsPersonalRecordsGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";

interface UsePersonalRecordsResult {
  data: PersonalRecord[];
  loading: boolean;
  error: string | null;
}

const PersonalRecordSchema = z.union([
  Generated.RunPersonalRecordResponse,
  Generated.RidePersonalRecordResponse,
]);

type PersonalRecordUnion = z.infer<typeof PersonalRecordSchema>;

function mapToView(row: PersonalRecordUnion): PersonalRecord {
  return {
    type: row.type,
    label: row.label,
    sport: row.sport,
    date: row.date,
    activityId: row.activity_id,
    value_formatted: row.value_formatted,
  };
}

export function usePersonalRecords(): UsePersonalRecordsResult {
  const { data, error, isLoading } = useSWR<PersonalRecord[]>(
    ["/insights/personal-records", {}],
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => getPersonalRecordsApiV1InsightsPersonalRecordsGet({}, {}, f),
          z.array(PersonalRecordSchema),
        ).then((rows) => rows.map(mapToView)),
    },
  );

  return {
    data: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
  };
}
