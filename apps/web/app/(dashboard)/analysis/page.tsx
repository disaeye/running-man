import { useState } from "react";
import { Page, Segmented } from "@shared/ui/Lovable";
import { AnalysisLoadRecovery } from "@features/analysis/components/AnalysisLoadRecovery";
import { AnalysisPerformance } from "@features/analysis/components/AnalysisPerformance";
import { AnalysisBodyLife } from "@features/analysis/components/AnalysisBodyLife";

export default function AnalysisPage() {
  const [tab, setTab] = useState("load");
  return <Page title="分析"><Segmented options={[{ value: "load", label: "负荷与恢复" }, { value: "performance", label: "能力与表现" }, { value: "body", label: "身体与生活" }]} value={tab} onChange={setTab} />{tab === "load" ? <AnalysisLoadRecovery /> : tab === "performance" ? <AnalysisPerformance /> : <AnalysisBodyLife />}</Page>;
}
