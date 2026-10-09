"use client";

import { Card } from "@shared/ui/Card";
import { KpiCard } from "@shared/ui/KpiCard";
import { ChartShell } from "@shared/ui/ChartShell";
import { SectionHeader } from "@shared/ui/SectionHeader";
import { EMPTY_LABEL } from "@shared/lib/use-data-state";

const SAMPLE_SPARKLINE = [60, 65, 58, 72, 68, 80, 75, 85, 82, 90];

export function CardsGallery() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionHeader title="Card" subtitle="Hairline border, no shadow" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card padding="none"><p className="p-4 text-body text-text-primary">padding: none</p></Card>
          <Card padding="sm"><p className="text-body text-text-primary">padding: sm</p></Card>
          <Card padding="md"><p className="text-body text-text-primary">padding: md</p></Card>
          <Card padding="lg"><p className="text-body text-text-primary">padding: lg</p></Card>
        </div>
      </div>

      <div>
        <SectionHeader title="KpiCard" subtitle="Plain label / value / unit" />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="距离" value="42.2" unit="km" />
          <KpiCard label="配速" value="4:32" unit="/km" />
          <KpiCard label="爬升" value="320" unit="m" />
          <KpiCard label="心率" value="148" unit="bpm" />
        </div>
      </div>

      <div>
        <SectionHeader title="KpiCard" subtitle="Term explanation + tooltip" />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard termKey="CTL" value="85" />
          <KpiCard label="ATL" tooltip="Acute load" value="72" color="text-atl" />
          <KpiCard termKey="TSB" value="13" color="text-success" />
          <KpiCard label="ACWR" tooltip="Acute:chronic ratio" value="0.85" />
        </div>
      </div>

      <div>
        <SectionHeader title="KpiCard" subtitle="Number + sparkline + delta + unit + zone" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="CTL"
            value="85"
            unit="TSS"
            trend="up"
            sparklineData={SAMPLE_SPARKLINE}
            tooltip="Chronic training load"
          />
          <KpiCard
            label=" resting HR"
            value="52"
            unit="bpm"
            trend="down"
            trendColor="text-success"
            sparklineData={[60, 58, 55, 54, 53, 52, 51, 52]}
            sparklineVariant="line"
          />
          <KpiCard
            label="Threshold Pace"
            value="4:32"
            unit="/km"
            zoneLabel="Zone 3"
            zones={[
              { min: 0, max: 5, tone: "safe", label: "Easy" },
              { min: 5, max: 6, tone: "caution", label: "Threshold" },
              { min: 6, max: 8, tone: "danger", label: "VO₂max" },
            ]}
            displayMin={3}
            displayMax={8}
            markerValue={5.5}
          />
        </div>
      </div>

      <div>
        <SectionHeader title="ChartShell" />
        <ChartShell
          title="PMC 趋势"
          subtitle="过去 90 天"
          provenance="数据来源: Intervals.icu"
          className="mt-4"
        >
          <div className="flex h-[160px] items-center justify-center text-text-muted text-subheadline">
            Chart placeholder
          </div>
        </ChartShell>
        <ChartShell
          title="空状态"
          empty
          emptyMessage={EMPTY_LABEL}
          className="mt-4"
        />
      </div>
    </div>
  );
}
