"use client";

import { Button } from "@shared/ui/button";
import { SectionHeader } from "@shared/ui/SectionHeader";
import { Plus } from "lucide-react";

export function ButtonGallery() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionHeader title="Button Variants" subtitle="All six variants" />
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="default">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
        </div>
      </div>

      <div>
        <SectionHeader title="Button Sizes" subtitle="XS / SM / Default (44px) / LG" />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="xs">XS</Button>
          <Button size="sm">SM</Button>
          <Button size="default">Default (44px)</Button>
          <Button size="lg">LG</Button>
        </div>
      </div>

      <div>
        <SectionHeader title="Icon Buttons" subtitle="All 44px touch targets" />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="icon-xs" aria-label="Extra small icon" variant="outline">
            <Plus />
          </Button>
          <Button size="icon-sm" aria-label="Small icon" variant="outline">
            <Plus />
          </Button>
          <Button size="icon" aria-label="Default icon" variant="outline">
            <Plus />
          </Button>
          <Button size="icon-lg" aria-label="Large icon" variant="outline">
            <Plus />
          </Button>
        </div>
      </div>
    </div>
  );
}
