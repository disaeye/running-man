import { cn } from "@shared/lib/utils";

export interface Reading {
  readonly label: string;
  /** 读数本身；`null` 表示没测到，显示「未记录」。 */
  readonly value: string | null;
  readonly unit?: string | null;
  readonly note?: string | null;
  readonly tone?: "default" | "warn";
}

/**
 * The four-cell reading strip: the page's opening rhythm.
 *
 * Every dashboard surface starts with the same block so the numbers land in the
 * same place whatever the page. Cells are separated by hairlines, never by
 * cards; on phones the strip folds to two columns and keeps the same order.
 *
 * The figures are monospace: a reading is a number, and a number that does not
 * hold its column width makes a row of four read as a row of guesses.
 */
export function ReadingStrip({
  items,
  className,
  testId,
}: {
  readonly items: readonly Reading[];
  readonly className?: string;
  readonly testId?: string;
}) {
  return (
    <dl
      data-testid={testId}
      className={cn(
        "grid grid-cols-2 border-t border-border-subtle md:grid-cols-4",
        className,
      )}
    >
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cn(
            "min-w-0 py-4",
            index % 2 === 1 && "border-l border-border-subtle pl-4",
            index >= 2 && "border-t border-border-subtle md:border-t-0",
            index > 0 && "md:border-l md:border-border-subtle md:pl-6",
            index === 0 && "md:pr-6",
          )}
        >
          <dt className="text-caption1 text-text-muted">{item.label}</dt>
          <dd className="mt-1.5 flex items-baseline gap-1.5">
            {item.value == null ? (
              <span className="text-caption1 text-text-muted">未记录</span>
            ) : (
              <>
                <span
                  className={cn(
                    "font-mono text-title1 font-normal tabular-nums",
                    item.tone === "warn" ? "text-warning" : "text-accent-strong",
                  )}
                >
                  {item.value}
                </span>
                {item.unit && <span className="text-caption1 text-text-muted">{item.unit}</span>}
              </>
            )}
          </dd>
          {item.note && <p className="mt-1 text-caption1 text-text-secondary">{item.note}</p>}
        </div>
      ))}
    </dl>
  );
}
