/**
 * 临时脚手架：本轮所有示例数据集中在这一个文件里。
 *
 * 开发库现在还没有真实内容——目标表是空的、比赛成绩也是空的——页面上就只剩空态，
 * 排版的形状、读数的字号、比赛准备度的两格都无从审起。这里用一组固定的示例先把
 * 版面填成真实数据该有的样子。
 *
 * 它是脚手架，不是特性：
 *
 * - 这些数据不来自接口，也不会写回接口。示例的 `goal_id` 与 `athlete_id` 在库里
 *   都不存在，所以示例卡必须是只读的（见 `GoalCard` 的 `readOnly`）。
 * - 等开发库有真实数据后，整个 `shared/dev/` 目录删掉，再把下面三个使用处还原：
 *   `app/(dashboard)/goals/page.tsx`（示例目标卡与比赛准备度）、
 *   `features/today/components/HomePortrait.tsx`（示例等级顶上身份条）、
 *   `features/today/components/IdentityStrip.tsx`（「示例数据」标记的落点）。
 * - 唯一开关是 `SAMPLE_DATA_ENABLED`，改成 `false` 就整体退回原来的空态。
 *
 * 字段形状靠使用处校验，不靠这里的注释：`Goal` 直接 import 真实类型；`SAMPLE_GRADE`
 * 故意不 import `GradeSnapshot`——`shared/` 不能反向依赖 `features/`——它的形状由
 * `HomePortrait` 里的赋值核对，字段对不上就是 tsc 报错。
 */

import { toISODate } from "@shared/lib/format";
import type { Goal } from "@shared/types/goals";

/** 唯一开关。关掉它，页面回到「没有数据」的原样。 */
export const SAMPLE_DATA_ENABLED = true;

/** 示例数据挂在一个不存在的运动员上：任何一处把它写回接口都会当场查无此人。 */
const SAMPLE_ATHLETE_ID = "sample-athlete";

/** 按本地年月日往后数 `days` 天，避免 `toISOString()` 把日期挪到前一天。 */
function addDays(today: Date, days: number): string {
  const next = new Date(today);
  next.setDate(next.getDate() + days);
  return toISODate(next);
}

/**
 * 两个示例目标：一个近期比赛（58 天后，落在比赛准备度卡的 90 天窗口内），
 * 一个跨三个月的跑量里程碑。日期由调用处传进来，这样静态预渲染的 HTML 里
 * 不会留下构建那天的日期。
 */
export function sampleGoals(today: Date): Goal[] {
  const stamp = today.toISOString();
  return [
    {
      goal_id: "sample-goal-half-marathon",
      athlete_id: SAMPLE_ATHLETE_ID,
      type: "event",
      title: "半程马拉松破 1:28",
      // 半马：当前 1:30:40（5440 秒），目标 1:28:00（5280 秒）。
      // 时间类目标越小越好，但 `goalProgress` 按 current/target 算，这里先接受
      // 它把进度读到 100% 上限——版面对，语义留给真实数据。
      target_value: 5280,
      current_value: 5440,
      unit: "秒",
      target_date: addDays(today, 58),
      race_distance_m: 21097,
      race_target_time_s: 5280,
      status: "active",
      created_at: stamp,
      updated_at: stamp,
    },
    {
      goal_id: "sample-goal-monthly-volume",
      athlete_id: SAMPLE_ATHLETE_ID,
      type: "distance",
      title: "三个月跑量 600 公里",
      target_value: 600,
      current_value: 412,
      unit: "公里",
      target_date: addDays(today, 90),
      race_distance_m: null,
      race_target_time_s: null,
      status: "active",
      created_at: stamp,
      updated_at: stamp,
    },
  ];
}

/**
 * 身份条上的等级快照，形状与 `features/today/lib/grade-label.ts` 的
 * `GradeSnapshot` 一致（badge / time / context / detail / pct）。
 *
 * `pct` 带「年龄分级」四个字，和 `gradeSnapshot()` 生成的真实值同一措辞——
 * `IdentityStrip` 原样渲染这个串，示例里只放数值会和真实数据读成两句话。
 */
export const SAMPLE_GRADE = {
  badge: "业余二级",
  time: "1:32:04",
  context: "半程马拉松 · 35-39 岁组",
  detail: "示例数据",
  pct: "年龄分级 62.4%",
};
