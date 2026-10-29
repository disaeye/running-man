export interface HeartRateCapInput {
  readonly prescriptionMaxHr?: number | null;
  readonly workoutType?: string | null;
  readonly hrMax?: number | null;
  readonly lthr?: number | null;
}

export interface HeartRateCapResult {
  readonly cap: number | null;
  readonly note: string | null;
}

/**
 * 推导今日训练的心率上限指标。
 *
 * 优先取处方中指定的心率上限；若处方未明确指定，则根据今日训练类型与运动员
 * 最大心率或乳酸阈值心率推算合理的心率区间上限。
 */
export function resolveHeartRateCap(input: HeartRateCapInput): HeartRateCapResult {
  if (input.prescriptionMaxHr != null && input.prescriptionMaxHr > 0) {
    return { cap: input.prescriptionMaxHr, note: "处方指定" };
  }

  const type = input.workoutType?.toLowerCase() ?? "";

  if (type === "intervals" || type === "repetition" || type === "sprint") {
    if (input.hrMax != null) return { cap: input.hrMax, note: "最大心率" };
  }

  if (type === "tempo" || type === "threshold") {
    if (input.lthr != null) return { cap: input.lthr, note: "乳酸阈值" };
    if (input.hrMax != null) return { cap: Math.round(input.hrMax * 0.88), note: "阈值上限" };
  }

  if (input.hrMax != null) {
    return { cap: Math.round(input.hrMax * 0.78), note: "Z2 上沿" };
  }
  if (input.lthr != null) {
    return { cap: Math.round(input.lthr * 0.85), note: "Z2 上沿" };
  }

  return { cap: null, note: null };
}
