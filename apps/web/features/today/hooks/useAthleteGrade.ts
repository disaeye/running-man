"use client";

import useSWR from "swr";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { athleteGradeApiV1InsightsAthleteGradeGet } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";
import type { AthleteGradePayload } from "@features/today/lib/grade-label";

/**
 * 运动员等级。后端已经算好了档位、年龄组与年龄分级，首页只负责显示。
 *
 * 走生成的客户端与生成的 zod 模型，字段漏掉就当场报错，而不是让徽章静默
 * 显示成空白。`grade` 为 null 是正常结果（还没比赛成绩、门槛表未填），
 * 此时 `reason` 说明原因；生成的模型把这几个字段标成可选，这里补成显式 null。
 */
function mapAthleteGrade(raw: Generated.AthleteGradeResponseOutput): AthleteGradePayload {
  const grade = raw.grade ?? null;
  return {
    configured: raw.configured,
    grade:
      grade === null
        ? null
        : {
            tier: grade.tier,
            event: grade.event,
            age_group: grade.age_group,
            time_s: grade.time_s,
            race_date: grade.race_date,
            event_name: grade.event_name,
            a1_certified: grade.a1_certified,
          },
    age_graded_pct: raw.age_graded_pct ?? null,
    reason: raw.reason ?? null,
  };
}

interface UseAthleteGradeResult {
  data: AthleteGradePayload | null;
  loading: boolean;
  error: string | null;
}

export function useAthleteGrade(): UseAthleteGradeResult {
  const { data, error, isLoading } = useSWR<AthleteGradePayload>(
    ["/insights/athlete-grade", {}],
    {
      fetcher: () =>
        callOrvalValidated(
          (f) => athleteGradeApiV1InsightsAthleteGradeGet({}, f),
          Generated.AthleteGradeResponse,
        ).then(mapAthleteGrade),
    },
  );

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
  };
}
