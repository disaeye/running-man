"use client";

import { useState, useCallback } from "react";
import { callOrvalValidated } from "@shared/api/orval-adapter";
import { autoCalculateApiV1AthletesMeAutoCalculatePost } from "@shared/api/generated/clients";
import * as Generated from "@shared/api/generated/model";

interface PhysiologyResult {
  hr_max: number | null;
  lthr: number | null;
  threshold_pace: number | null;
  data_sufficient: boolean;
  confidence: string;
}

function parseConfidence(
  value: string | null,
): "high" | "medium" | "low" {
  switch (value) {
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
    default:
      return "low";
  }
}

function mapAutoCalculate(raw: Generated.AutoCalculateResponseOutput): PhysiologyResult {
  const confidenceSource =
    raw.hr_max.confidence ?? raw.lthr.confidence ?? raw.threshold_pace.confidence;
  return {
    hr_max: raw.hr_max.hr_max,
    lthr: raw.lthr.lthr,
    threshold_pace: raw.threshold_pace.threshold_pace_s_per_km,
    data_sufficient:
      raw.hr_max.data_sufficient &&
      raw.lthr.data_sufficient &&
      raw.threshold_pace.data_sufficient,
    confidence: parseConfidence(confidenceSource),
  };
}

export function usePhysiology() {
  const [data, setData] = useState<PhysiologyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await callOrvalValidated(
        (f) => autoCalculateApiV1AthletesMeAutoCalculatePost({}, f),
        Generated.AutoCalculateResponse,
      );
      setData(mapAutoCalculate(raw));
    } catch (err) {
      setError(err instanceof Error ? err.message : "估算失败");
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, calculate };
}
