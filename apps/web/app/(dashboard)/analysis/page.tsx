"use client";

import { Suspense } from "react";
import { Page } from "@shared/ui/Lovable";
import { AnalysisContent } from "@features/analysis/components/AnalysisContent";

export default function AnalysisPage() {
  return (
    <Page title="分析" eyebrow="中长期趋势">
      <Suspense fallback={null}>
        <AnalysisContent />
      </Suspense>
    </Page>
  );
}
