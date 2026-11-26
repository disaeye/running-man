"use client";

import { Card, PageCard } from "@shared/ui/Card";
import { Stat } from "@shared/ui/StatCell";
import { VerdictCard } from "@shared/ui/VerdictCard";
import { PlanActualDeltaGrid } from "@shared/ui/PlanActualDeltaGrid";
import { ProportionBar } from "@shared/ui/ProportionBar";
import { ChartShell } from "@shared/ui/ChartShell";
import { NO_VALUE } from "@shared/lib/use-data-state";
import { Tag } from "@shared/ui/Badge";
import { ShowcaseHeading } from "./ShowcaseHeading";

export function CardsGallery() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <ShowcaseHeading title="Card & PageCard" subtitle="Content cards vs Action cards with status stripe" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card padding="sm"><p className="text-body text-text-primary">Card sm</p></Card>
          <Card padding="md"><p className="text-body text-text-primary">Card md</p></Card>
          <PageCard title="PageCard" action={<Tag tone="info">同步</Tag>}>
            <p className="text-subheadline text-text-secondary">统一 16px 圆角内容面板</p>
          </PageCard>
          <PageCard title="Hero Accent" hero accent="warn">
            <p className="text-subheadline text-text-secondary">左侧状态条强调卡</p>
          </PageCard>
        </div>
      </div>

      <div>
        <ShowcaseHeading title="VerdictCard & Stat" subtitle="Conclusion-first focal action card with MetricInlineDisclosure" />
        <div className="mt-4 max-w-2xl">
          <VerdictCard
            accent="accent"
            eyebrow="今日安排 · 节奏跑"
            title="40 分钟乳酸阈值节奏跑"
            badge={<Tag tone="primary">按计划执行</Tag>}
            metrics={
              <div className="grid grid-cols-3 gap-3">
                <Stat label="距离" value="8.5" unit="km" focal />
                <Stat label="GAP 目标" termKey="GAP" value="4:25" unit="/km" />
                <Stat label="预计 TSS" termKey="TSS" value="62" />
              </div>
            }
          />
        </div>
      </div>

      <div>
        <ShowcaseHeading title="PlanActualDeltaGrid" subtitle="Aligned planned vs actual vs delta comparison" />
        <div className="mt-4 max-w-2xl">
          <PlanActualDeltaGrid
            rows={[
              { key: "dist", label: "距离", planned: "8.0 km", actual: "8.2 km", delta: { label: "距离 +0.2 km", tone: "neutral" } },
              { key: "pace", label: "配速", planned: "4:20–4:30 /km", actual: "4:26 /km", delta: { label: "配速达标 ✓", tone: "success" } },
              { key: "hr", label: "心率", planned: null, actual: null },
            ]}
          />
        </div>
      </div>

      <div>
        <ShowcaseHeading title="ProportionBar" subtitle="Shared multi-segment distribution bar" />
        <div className="mt-4 max-w-2xl">
          <ProportionBar
            columns={5}
            segments={[
              { key: "Z1", label: "Z1", pct: 25, colorClass: "bg-z1" },
              { key: "Z2", label: "Z2", pct: 55, colorClass: "bg-z2" },
              { key: "Z3", label: "Z3", pct: 12, colorClass: "bg-z3" },
              { key: "Z4", label: "Z4", pct: 6, colorClass: "bg-z4" },
              { key: "Z5", label: "Z5", pct: 2, colorClass: "bg-z5" },
            ]}
          />
        </div>
      </div>

      <div>
        <ShowcaseHeading title="ChartShell" subtitle="Provenance & empty states" />
        <ChartShell
          title="PMC 趋势"
          subtitle="过去 90 天"
          provenance="数据来源: Intervals.icu"
          className="mt-4"
        >
          <div className="flex h-[120px] items-center justify-center text-subheadline text-text-muted">Chart placeholder</div>
        </ChartShell>
        <ChartShell title="空状态" empty emptyMessage={NO_VALUE} className="mt-4" />
      </div>
    </div>
  );
}
