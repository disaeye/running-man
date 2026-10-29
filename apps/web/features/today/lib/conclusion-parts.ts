/**
 * 结论句的拆法：把「今天练什么」分成类别与内容两半。
 *
 * 参考稿的句子是 `今天练` + `有氧耐力 60 分钟`——前半句是普通字重，后半句是
 * 强调字重。粗细的差别让眼睛先读到内容，再回头补上「今天练」这个壳。
 *
 * 拆不出来的场合（没有课表、数据不足）不硬拆：整句作为强调部分，
 * 「今天」那个壳单独给。
 */

export interface ConclusionParts {
  /** 普通字重的部分。 */
  readonly lead: string;
  /** 强调字重的部分。 */
  readonly emphasis: string;
}

const WORKOUT_TYPE_TEXT: Record<string, string> = {
  easy: "有氧耐力",
  long: "长距离",
  tempo: "节奏跑",
  intervals: "间歇跑",
  recovery: "恢复跑",
  rest: "休息",
  quality: "质量课",
  race: "比赛",
  strength: "力量训练",
};

/**
 * @param workoutType 接口给的课表类型键。
 * @param durationMin 课表时长，分钟。
 */
export function conclusionParts(
  workoutType: string | null,
  durationMin: number | null,
): ConclusionParts {
  if (workoutType == null || workoutType === "rest") {
    return { lead: "今天", emphasis: workoutType === "rest" ? "休息" : "没有安排课表" };
  }
  const label = WORKOUT_TYPE_TEXT[workoutType] ?? workoutType;
  const minutes = durationMin != null && durationMin > 0 ? Math.round(durationMin) : null;
  return {
    lead: "今天练",
    emphasis: minutes != null ? `${label} ${minutes} 分钟` : label,
  };
}
