export interface MetricStripItem {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly note?: string;
  readonly ratio?: number;
}

/**
 * 摘要格：一个动作或一段时间的关键数（距离、时长、负荷）。
 *
 * 格与格之间是 `bg-border-subtle` 露出来的内部发丝线，不是外框；
 * 每格白底，整块没有边线也没有阴影。
 *
 * `ratio` 存在时在格底加一条 6px 细进度条，表示这一项占目标的比例。
 * 值夹到 0–100，条宽和读数是同一个数。
 *
 * `columns` 同时决定手机与 sm 以上的列数，只有四格在手机上折行：
 * 四格挤成一列会把整块读数拉成一整屏，折成 2×2，和旧的四格读数条
 * （`ReadingStrip` 手机两列）同一个节奏；三格折行只剩 2+1，参差比
 * 单列更难看，所以三格在手机上保持一列，`sm` 以上才横排。
 */
const COLUMNS_CLASS: Record<2 | 3 | 4, string> = {
  2: "grid-cols-2 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

export function MetricStrip({
  items,
  testId,
  columns = 3,
}: {
  readonly items: ReadonlyArray<MetricStripItem>;
  readonly testId?: string;
  readonly columns?: 2 | 3 | 4;
}) {
  return (
    <dl
      className={`grid gap-px overflow-hidden rounded-2xl bg-border-subtle ${COLUMNS_CLASS[columns]}`}
      data-testid={testId}
    >
      {items.map((item, index) => {
        const percent =
          item.ratio === undefined ? null : Math.round(Math.min(100, Math.max(0, item.ratio)));

        return (
          <div
            key={`${item.label}-${index}`}
            className="min-w-0 bg-surface-card px-4 py-3"
          >
            <dt className="text-caption1 text-text-muted">{item.label}</dt>
            <dd className="mt-1 flex flex-wrap items-baseline gap-1 font-mono text-metric-lg font-semibold tabular-nums text-text-primary">
              <span>{item.value}</span>
              {item.unit ? (
                <span className="font-sans text-caption1 font-normal text-text-muted">
                  {item.unit}
                </span>
              ) : null}
            </dd>
            {item.note ? (
              <p className="mt-1 text-caption1 text-text-muted">{item.note}</p>
            ) : null}
            {percent !== null ? (
              <div
                role="progressbar"
                aria-label={item.label}
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-active"
              >
                <div
                  className="fill-motion h-full rounded-full bg-accent"
                  style={{ transform: `scaleX(${percent / 100})` }}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </dl>
  );
}
