/** 训练阶段名到中文标签的唯一映射。 */

export const PHASE_LABELS: Readonly<Record<string, string>> = {
  base: "基础期",
  build: "强化期",
  peak: "巅峰期",
  taper: "减量期",
  race: "比赛日",
  recovery: "恢复期",
};

/** 取阶段的中文标签；未知名原样返回。 */
export function phaseLabel(name: string | null | undefined): string {
  if (!name) return "";
  return PHASE_LABELS[name] ?? name;
}
