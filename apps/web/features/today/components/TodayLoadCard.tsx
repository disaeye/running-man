import { PageCard, Stat } from "@shared/ui/Lovable";
import { NO_VALUE } from "@shared/lib/use-data-state";
import type { PmcPoint } from "@features/pmc/hooks/usePmcData";

export function TodayLoadCard({ point }: { readonly point: PmcPoint | null }) {
  return <PageCard title="短期负荷"><div className="grid grid-cols-4 gap-2"><Stat label="CTL 体能" value={format(point?.ctl)} tone="text-fitness" /><Stat label="ATL 疲劳" value={format(point?.atl)} tone="text-fatigue" /><Stat label="TSB 状态" value={format(point?.tsb)} tone="text-warn" /><Stat label="ACWR" value={format(point?.acwr)} sub="变化参考" /></div></PageCard>;
}

function format(value: number | null | undefined) {
  return value == null ? NO_VALUE : value.toFixed(1);
}
