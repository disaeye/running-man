"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@shared/ui/tabs";
import { ThemeToggle } from "@shared/ui/ThemeToggle";
import { ButtonGallery } from "./ButtonGallery";
import { CardsGallery } from "./CardsGallery";
import { InputsGallery } from "./InputsGallery";
import { FeedbackGallery } from "./FeedbackGallery";
import { LayoutGallery } from "./LayoutGallery";
import { OverlayGallery } from "./OverlayGallery";
import { RingsGallery } from "./RingsGallery";

const TABS = [
  { value: "buttons", label: "Buttons" },
  { value: "cards", label: "Cards" },
  { value: "inputs", label: "Inputs" },
  { value: "feedback", label: "Feedback" },
  { value: "layout", label: "Layout" },
  { value: "overlays", label: "Overlays" },
  { value: "rings", label: "Rings" },
] as const;

export default function PrimitiveShowcasePage() {
  const [tab, setTab] = useState("buttons");

  return (
    <main className="w-full max-w-none overflow-x-hidden px-5 py-6 md:px-8">
      {/* Dev-only banner */}
      <div className="mb-6 rounded-lg border border-warning/30 bg-warning/10 p-4">
          <p className="text-subheadline font-medium text-warning">Dev/Test Only — Not Linked from Production Navigation</p>
        <p className="mt-1 text-footnote text-text-muted">
          v7 primitive gallery. All tokens from{" "}
          <code className="rounded bg-surface-overlay px-1">globals.css</code>.
          Excluded from{" "}
          <code className="rounded bg-surface-overlay px-1">nav-config.ts</code>.
        </p>
      </div>

      {/* Header with theme toggle */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-display-sm font-bold text-text-primary">
            Primitive Showcase
          </h1>
          <p className="mt-1 text-subheadline text-text-muted">
            v7 design-system primitives — all variants, all states, both themes.
          </p>
        </div>
        <ThemeToggle />
      </div>

      {/* Reduced-motion note */}
      <div className="mt-4 rounded-lg border border-border-default bg-surface-overlay p-3">
        <p className="text-caption1 text-text-muted">
          <strong className="text-text-secondary">Reduced motion:</strong> All
          animations use CSS{" "}
          <code className="rounded bg-surface-card px-1">motion-safe:</code>{" "}
          variants. When{" "}
          <code className="rounded bg-surface-card px-1">
            prefers-reduced-motion: reduce
          </code>{" "}
          is active, transitions and keyframe animations are disabled.
          GPU-composited properties only (
          <code className="rounded bg-surface-card px-1">transform</code>,{" "}
          <code className="rounded bg-surface-card px-1">opacity</code>,{" "}
          <code className="rounded bg-surface-card px-1">filter</code>).
        </p>
      </div>

      {/* Tab navigation */}
      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="buttons" className="mt-4">
          <ButtonGallery />
        </TabsContent>
        <TabsContent value="cards" className="mt-4">
          <CardsGallery />
        </TabsContent>
        <TabsContent value="inputs" className="mt-4">
          <InputsGallery />
        </TabsContent>
        <TabsContent value="feedback" className="mt-4">
          <FeedbackGallery />
        </TabsContent>
        <TabsContent value="layout" className="mt-4">
          <LayoutGallery />
        </TabsContent>
        <TabsContent value="overlays" className="mt-4">
          <OverlayGallery />
        </TabsContent>
        <TabsContent value="rings" className="mt-4">
          <RingsGallery />
        </TabsContent>
      </Tabs>
    </main>
  );
}
