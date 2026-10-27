/**
 * 分段表与计圈表共用的行语法。
 *
 * 线是行级的：数据行之间靠 `divide-y` 的发丝线，表头下沿一条，没有哪个单元格
 * 自己画 `border-b`。内边距也只在行上声明一次，单元格只负责左右对齐。
 *
 * 数值单元走等宽数字（`font-mono tabular-nums`），一列数字上下对得齐；单位退到
 * 12px 的 `text-text-muted` 跟在数值后面，不和读数挤在同一个字号里。
 */

/** 数据行：上下 10px，列间 12px，最后一列不留右内边距。 */
export const SPLIT_ROW = "[&>td]:py-2.5 [&>td]:pr-3 [&>td:last-child]:pr-0";

/** 表头行：与数据行共用一套列间距，只留 8px 下沿。 */
export const SPLIT_HEAD_ROW =
  "text-text-muted [&>th]:pb-2 [&>th]:pr-3 [&>th:last-child]:pr-0 [&>th]:font-medium";

interface SplitValueProps {
  value: string;
  unit?: string;
}

/** 一个数值单元：值不带上色，颜色由所在单元格决定；也不许在值和单位之间折行。 */
export function SplitValue({ value, unit }: SplitValueProps) {
  return (
    <span className="whitespace-nowrap font-mono text-body tabular-nums">
      {value}
      {unit != null && (
        <span className="ml-1 font-sans text-caption1 text-text-muted">{unit}</span>
      )}
    </span>
  );
}

/**
 * 把 `formatDistance`（`1.0 km`）这类「值 单位」字符串拆开，好让单位单独排版。
 * 没有空格就整串当值——`formatPace` 的 `5'32"` 走这条。
 */
export function splitUnit(formatted: string): { value: string; unit?: string } {
  const at = formatted.lastIndexOf(" ");
  if (at <= 0) return { value: formatted };
  return { value: formatted.slice(0, at), unit: formatted.slice(at + 1) };
}

/**
 * 残段判定需要的行距离。
 *
 * 分段表的最后一行常常是切分余数：11 km 的训练，最后一段只有 158 m，配速
 * 4'08” 数学上没错，但那是一次除法的尾巴，不是一段真实训练。把距离拿进来，
 * 残段就退出「最快」的比较——行还留在表里，数值照常显示，只是不戴标记。
 */
export interface FastestPaceRows {
  /** 与 speeds 同序的行距离（米）。 */
  readonly distances: readonly (number | null)[];
  /** 距离分段的主步长（米）；时间分段与设备圈段留空，改写全表距离中位数。 */
  readonly strideM?: number | null;
}

/** 残段阈值：距离分段取步长一半；没有步长时取全表距离中位数的一半。 */
function residualDistanceM(rows: FastestPaceRows): number {
  if (rows.strideM != null && rows.strideM > 0) return rows.strideM / 2;
  const known = rows.distances
    .filter((distance): distance is number => distance != null && distance > 0)
    .sort((a, b) => a - b);
  if (known.length === 0) return 0;
  const mid = Math.floor(known.length / 2);
  const median =
    known.length % 2 === 0
      ? ((known[mid - 1] ?? 0) + (known[mid] ?? 0)) / 2
      : known[mid] ?? 0;
  return median / 2;
}

/**
 * 配速最快的那一行：平均速度取最大，`null` 与零速的行不参与比较。
 *
 * 全部缺失时返回 `-1`，调用方就不会标出任何一行——「没有可比的配速」和
 * 「每一行都一样快」不该长得一样。并列时取靠前的一行，保证只有一行戴标记。
 *
 * 传入 `rows` 时，距离不到残段阈值的行不参与比较；整表都是残段（只有一段
 * 很短的距离）时退回全表比较，不能一个都不标。
 */
export function fastestPaceIndex(
  speeds: readonly (number | null)[],
  rows?: FastestPaceRows,
): number {
  const comparable = (speed: number | null | undefined): speed is number =>
    speed != null && speed > 0;

  const threshold = rows == null ? 0 : residualDistanceM(rows);
  const isResidual = (index: number): boolean => {
    if (rows == null) return false;
    const distance = rows.distances[index];
    return distance != null && distance < threshold;
  };
  // 有一行完整段落才值得排除残段；全短表退回全表比较。
  const hasWholeRow = speeds.some(
    (speed, index) => comparable(speed) && !isResidual(index),
  );

  let fastest = -1;
  let best = Number.NEGATIVE_INFINITY;
  speeds.forEach((speed, index) => {
    if (!comparable(speed)) return;
    if (hasWholeRow && isResidual(index)) return;
    if (speed > best) {
      best = speed;
      fastest = index;
    }
  });
  return fastest;
}
