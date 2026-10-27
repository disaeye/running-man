/**
 * 等级 → 徽章与说明。`GET /api/v1/insights/athlete-grade` 的返回压成身份条要的样子。
 *
 * 接口给的是合同键（`tier1`、`half`、`age_group: 35`），直接印在条上读不成句子。
 * 这一层只做翻译和拼句，不判断有没有成绩——`grade` 为 null 就是没有，
 * 原因由接口的 `reason` 说明，不要在这里编。
 */

export interface AthleteGrade {
  readonly tier: string;
  readonly event: string;
  readonly age_group: number;
  readonly time_s: number;
  readonly race_date: string;
  readonly event_name: string;
  readonly a1_certified: boolean;
}

export interface AthleteGradePayload {
  readonly configured: boolean;
  readonly grade: AthleteGrade | null;
  readonly age_graded_pct: number | null;
  readonly reason: string | null;
}

export interface GradeSnapshot {
  /** 徽章上的等级，`精英级` / `一级` / `二级`。 */
  readonly badge: string;
  /** 40px 那个读数：完赛时间。 */
  readonly time: string;
  /** 项目与年龄组，放在右端的辅助行上。 */
  readonly context: string;
  /** 整句（项目 · 年龄组 · 完赛时间），挂在块的 `title` 上。 */
  readonly detail: string;
  /** 年龄分级百分比，没有分级时 null。 */
  readonly pct: string | null;
}

const TIER_LABEL: Record<string, string> = {
  elite: "精英级",
  tier1: "一级",
  tier2: "二级",
};

const EVENT_LABEL: Record<string, string> = {
  "5k": "5K",
  "10k": "10K",
  half: "半程马拉松",
  marathon: "马拉松",
};

/** 查不到的键原样返回：新档位先显示合同键，也好过显示空白。 */
export function tierLabel(tier: string): string {
  return TIER_LABEL[tier] ?? tier;
}

export function eventLabel(event: string): string {
  return EVENT_LABEL[event] ?? event;
}

/** `1:32:05`，一小时以内写 `18:42`。 */
function clockTime(timeS: number): string {
  const total = Math.max(0, Math.round(timeS));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** 年龄组是组的下界；0 表示最年轻那一档，没有更小的边界可写。 */
function ageGroupLabel(ageGroup: number): string {
  return ageGroup > 0 ? `${ageGroup}-${ageGroup + 4} 岁组` : "34 岁以下组";
}

export function gradeSnapshot(payload: AthleteGradePayload | null): GradeSnapshot | null {
  const grade = payload?.grade;
  if (grade == null) return null;
  const pct = payload?.age_graded_pct;
  const time = clockTime(grade.time_s);
  const context = `${eventLabel(grade.event)} · ${ageGroupLabel(grade.age_group)}`;
  return {
    badge: tierLabel(grade.tier),
    time,
    context,
    detail: `${context} · ${time}`,
    pct: pct == null ? null : `年龄分级 ${pct.toFixed(1)}%`,
  };
}
