import { PageCard } from "@shared/ui/Card";
import { TextLink } from "@shared/ui/TextLink";
import { ZONE_TONE_CLASS, zoneFor } from "@shared/lib/metric-zone";
import type { PmcPoint } from "@features/pmc/hooks/usePmcData";

/**
 * 首页负荷结论：只保留一句状态判断与异常读数，完整遥测与分析留给「分析」页。
 */
export function TodayLoadCard({ points }: { readonly points: readonly PmcPoint[] }) {
  const latest = points.at(-1) ?? null;
  const tsbZone = zoneFor("tsb", latest?.tsb);
  const acwrZone = zoneFor("acwr", latest?.acwr);
  const statusZone = tsbZone ?? acwrZone;
  const statusTone = statusZone ? ZONE_TONE_CLASS[statusZone.tone] : null;

  return (
    <PageCard
      testId="home-load"
      action={<TextLink href="/analysis" arrow>查看趋势</TextLink>}
    >
      {statusZone && statusTone ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={`size-2 shrink-0 rounded-full ${statusTone.dot}`} aria-hidden="true" />
          <span className="text-subheadline font-semibold text-text-primary">
            训练状态 · {statusZone.label}
          </span>
          {latest?.acwr != null ? (
            <span className="num font-mono tabular-nums text-caption1 text-text-secondary">
              ACWR {latest.acwr.toFixed(2)}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-caption1 text-text-muted">负荷记录不足，暂无法给出状态判断。</p>
      )}
    </PageCard>
  );
}
