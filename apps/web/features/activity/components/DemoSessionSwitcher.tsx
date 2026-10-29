"use client";

import Link from "next/link";
import { NO_VALUE } from "@shared/lib/use-data-state";

/**
 * 场次切换器（参考稿的上一场 / 下一场）。
 *
 * 中间是这次训练的时间、运动类型与标签；左右两个按钮切换到相邻的
 * 训练记录。
 *
 * 相邻的训练记录是按开始时间排的同一批活动里的前后两个，所以「上一场」
 * 永远是时间上更早的那一次，跨运动类型也一样（骑行和跑步排在一起）。
 */

interface AdjacentActivity {
  readonly activityId: string;
  readonly label: string;
}

interface Props {
  /** 这次训练的标题：运动类型 + 名称。 */
  readonly title: string;
  /** 这次训练的时间标签。 */
  readonly timeLabel: string;
  /** 标签行：天气、运动类型等。 */
  readonly tags: readonly string[];
  /** 上一场（更早的训练）。 */
  readonly previous: AdjacentActivity | null;
  /** 下一场（更晚的训练）。 */
  readonly next: AdjacentActivity | null;
  readonly testId?: string;
}

export function DemoSessionSwitcher({
  title,
  timeLabel,
  tags,
  previous,
  next,
  testId,
}: Props) {
  return (
    <div data-testid={testId ?? "demo-session-switcher"}>
      <div className="flex items-center justify-between gap-2">
        <AdjacentButton
          target={previous}
          direction="previous"
          label="上一场训练"
        />
        <div className="min-w-0 flex-1 text-center">
          <p className="flex items-center justify-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-accent shadow-[0_0_8px_rgba(202,243,0,0.8)]"
            />
            <span className="truncate font-mono text-caption1 tracking-wider text-accent">
              {timeLabel}
            </span>
          </p>
          <h1 className="mt-0.5 truncate font-display text-title2 uppercase tracking-wide text-text-primary">
            {title}
          </h1>
        </div>
        <AdjacentButton target={next} direction="next" label="下一场训练" />
      </div>

      {tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-surface-overlay px-2.5 py-0.5 text-caption1 text-text-secondary"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * 一侧的切换按钮。
 *
 * 没有相邻的训练时按钮是空的（不是禁用态）：它占着位置，页面不会因为
 * 有没有上一场而改变形状。
 */
function AdjacentButton({
  target,
  direction,
  label,
}: {
  readonly target: AdjacentActivity | null;
  readonly direction: "previous" | "next";
  readonly label: string;
}) {
  const glyph = direction === "previous" ? "‹" : "›";
  if (!target) {
    return (
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-overlay/40 text-caption1 text-text-muted"
      >
        {glyph}
      </span>
    );
  }
  return (
    <Link
      href={`/activities/${target.activityId}`}
      aria-label={label}
      title={target.label}
      className="focus-ring grid size-10 shrink-0 place-items-center rounded-xl bg-surface-overlay text-caption1 text-text-secondary transition-colors hover:bg-surface-active hover:text-text-primary active:scale-95"
    >
      {glyph}
    </Link>
  );
}

export const SESSION_MISSING = NO_VALUE;
