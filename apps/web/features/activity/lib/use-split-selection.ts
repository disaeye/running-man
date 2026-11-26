"use client";

import { useState } from "react";
import { scrollToStreamCharts } from "./select-split-time";

export function useSplitSelection(setDetailTab: (tab: "charts") => void) {
  const [preview, setPreview] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const change = (value: number | null, source: "mouse" | "selection") => {
    if (source === "mouse") setPreview(value);
    else {
      setSelected(value);
      setPreview(null);
    }
  };
  const selectSplitTime = (timeSec: number) => {
    change(timeSec, "selection");
    setDetailTab("charts");
    scrollToStreamCharts();
  };
  return { hoverTimeSec: preview ?? selected, change, selectSplitTime };
}
