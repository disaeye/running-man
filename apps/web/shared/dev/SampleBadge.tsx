/**
 * 「示例数据」标记：临时脚手架里所有占位内容的视觉标识。
 *
 * 它存在的理由只有一个——让示例一眼就是示例，不会被误读成真实读数。所以它
 * 贴着示例内容放，真实数据的地方不出现它。等 `shared/dev/sample-data.ts` 删掉，
 * 这个文件一起删。
 *
 * 12px 用 `text-caption1`（`text-caption2` 是 11px 且只给拉丁文，中文在那里会糊）。
 */
export function SampleBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border-subtle bg-surface-overlay px-1.5 py-0.5 text-caption1 font-medium leading-none text-text-muted">
      示例数据
    </span>
  );
}
