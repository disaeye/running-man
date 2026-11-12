import { PageCard } from "@shared/ui/Lovable";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { PmcPoint } from "@features/pmc/hooks/usePmcData";

/**
 * 短期负荷：当前值加近 7 天变化。
 *
 * 变化量回答「比上周怎么样」：CTL 涨说明累积体能增加，ATL 涨说明最近练得多，
 * TSB 的变化比绝对值更能说明状态在往哪个方向走。
 */
export function TodayLoadCard({ points }: { readonly points: readonly PmcPoint[] }) {
  const latest = points.at(-1) ?? null;
  const weekAgo = points.at(-8) ?? points[0] ?? null;
  return <PageCard title="短期负荷">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <LoadStat label="CTL 体能" tone="text-fitness" latest={latest?.ctl} before={weekAgo?.ctl} digits={1} />
      <LoadStat label="ATL 疲劳" tone="text-fatigue" latest={latest?.atl} before={weekAgo?.atl} digits={1} />
      <LoadStat label="TSB 状态" tone="text-warn" latest={latest?.tsb} before={weekAgo?.tsb} digits={1} signed />
      <LoadStat label="ACWR" tone="" latest={latest?.acwr} before={weekAgo?.acwr} digits={2} sub="负荷变化参考" />
    </div>
  </PageCard>;
}

function LoadStat({
  label,
  tone,
  latest,
  before,
  digits,
  signed = false,
  sub,
}: {
  label: string;
  tone: string;
  latest: number | null | undefined;
  before: number | null | undefined;
  digits: number;
  signed?: boolean;
  sub?: string;
}) {
  const delta = latest != null && before != null ? latest - before : null;
  const rising = delta != null && delta > 0;
  return (
    <div className="min-w-0">
      <div className="text-caption1 text-muted-foreground">{label}</div>
      <div className={`num text-2xl font-semibold leading-tight ${tone}`}>
        {latest == null ? NO_VALUE : latest.toFixed(digits)}
      </div>
      {delta != null ? (
        <div className="num text-caption1 text-muted-foreground">
          7 天 {rising ? "↑" : delta < 0 ? "↓" : "→"} {signed && delta > 0 ? "+" : ""}{delta.toFixed(digits)}
        </div>
      ) : (
        <div className="text-caption1 text-muted-foreground">{sub ?? "近 7 天变化不足一周数据"}</div>
      )}
      {sub && delta != null ? <div className="text-caption1 text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
