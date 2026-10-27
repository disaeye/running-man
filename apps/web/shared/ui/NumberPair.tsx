import { NO_VALUE } from "@shared/lib/use-data-state";

export interface NumberPairSide {
  readonly label: string;
  /** `null` 表示这个字段还没有读数，占位由本原语统一打印。 */
  readonly value: string | null;
  readonly unit?: string;
}

function PairColumn({ side }: { readonly side: NumberPairSide }) {
  return (
    <div className="min-w-0">
      <div className="text-caption1 text-text-muted">{side.label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-1 font-mono text-metric-lg font-semibold tabular-nums text-text-primary">
        <span>{side.value ?? NO_VALUE}</span>
        {side.unit ? (
          <span className="font-sans text-caption1 font-normal text-text-muted">{side.unit}</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 双大数块：一个读数与它的对照读数并排（计划 vs 实际、本次 vs 上周）。
 *
 * 两列等分，手机上也是并排，不折成上下——折了就不再是比较，
 * 眼睛要把两个数记在心里才能比。数值超宽时换行，不裁切——
 * 被裁掉的读数等于没有读数。缺测的那一侧传 `null`，由这里打印
 * `NO_VALUE`，调用方不自己写占位符。
 */
export function NumberPair({
  left,
  right,
  testId,
}: {
  readonly left: NumberPairSide;
  readonly right: NumberPairSide;
  readonly testId?: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-4" data-testid={testId}>
      <PairColumn side={left} />
      <PairColumn side={right} />
    </div>
  );
}
