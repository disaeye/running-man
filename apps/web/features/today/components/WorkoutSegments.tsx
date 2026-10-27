"use client";

import { WorkoutStepList, type WorkoutStepView } from "./WorkoutStepList";

/**
 * 处方分段：今日行动卡里这一段结构。
 *
 * 逐段表达交给 `WorkoutStepList`——序号、组数、组间恢复都归它管；
 * 这一层是行动卡认的入口，分段为空或者没有处方时整块不出现。
 */

interface Props {
  readonly segments: ReadonlyArray<WorkoutStepView>;
  /**
   * 调用方仍按「第一个质量段」传这个值。现在没有「进行到第几步」的数据，
   * 所以步骤不分高亮；等真有进度再在这里决定怎么用。
   */
  readonly highlightIndex?: number;
}

export function WorkoutSegments({ segments }: Props) {
  return <WorkoutStepList segments={segments} />;
}
