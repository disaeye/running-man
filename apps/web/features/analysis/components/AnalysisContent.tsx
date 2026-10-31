"use client";

import { useState } from "react";
import { PageCard, Segmented } from "@shared/ui/Lovable";
import { AnalysisLoadRecovery } from "./AnalysisLoadRecovery";
import { AnalysisPerformance } from "./AnalysisPerformance";
import { AnalysisBodyLife } from "./AnalysisBodyLife";

const RANGES = [
  { value: "28", label: "4周" },
  { value: "84", label: "12周" },
  { value: "180", label: "半年" },
  { value: "90", label: "自定义" },
] as const;

export function AnalysisContent() {
  const [tab, setTab] = useState<"load" | "performance" | "body">("load");
  const [days, setDays] = useState("84");
  return <><Segmented options={[{ value: "load", label: "负荷与恢复" }, { value: "performance", label: "能力与表现" }, { value: "body", label: "身体与生活" }]} value={tab} onChange={setTab} />
    <div className="flex gap-3">{RANGES.map((range) => <button type="button" key={range.value} onClick={() => setDays(range.value)} className={days === range.value ? "text-xs font-semibold text-accent-strong" : "text-xs text-muted-foreground"}>{range.label}</button>)}</div>
    {tab === "load" ? <AnalysisLoadRecovery days={Number(days)} /> : tab === "performance" ? <AnalysisPerformance /> : <AnalysisBodyLife days={Number(days)} />}
  </>;
}

export function AnalysisCard({ children }: { children: React.ReactNode }) {
  return <PageCard>{children}</PageCard>;
}
