/**
 * 页头那一行右边写什么：数据到什么时候为止，以及数据源的状态。
 *
 * 这里说的是「数据停在哪里」，不是「出了什么问题」。几天没训练是正常结果，
 * 说成「已过期」等于在一周安��的时候挂警报。同步真的坏了由外壳的指示点说。
 */

export type ConnectionState = "loading" | "error" | "connected" | "disconnected";

export function freshnessCaption(
  /** 活动数据的截止日，ISO 字符串。 */
  asOf: string | null,
  connection: ConnectionState,
): string {
  if (asOf) return `数据截至 ${asOf.slice(5)}`;
  switch (connection) {
    case "connected":
      return "已连接，等待首次同步";
    case "disconnected":
      return "未连接数据源";
    case "error":
      return "读不到数据源状态";
    default:
      return "正在读取数据源状态";
  }
}

/**
 * 有没有可分析的历史。
 *
 * `current_tsb` 永远是个数字——没有负荷历史时它读 0——所以它不能用来证明历史
 * 存在。PMC 的点、活动流与报告的数据日期可以。
 */
export function hasHistory(input: {
  readonly asOf: string | null;
  readonly activityCount: number;
  readonly wellnessCount: number;
  readonly pmcCount: number;
}): boolean {
  return (
    input.asOf != null ||
    input.activityCount > 0 ||
    input.wellnessCount > 0 ||
    input.pmcCount > 0
  );
}
