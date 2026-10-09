"use client";

import { DataSources } from "@features/data/components/DataSources";
import { FlaggedActivitiesSection } from "@features/activity/components/FlaggedActivitiesSection";

/**
 * The data section: where data comes from, and what has been taken out of it.
 *
 * The two belong together. The reason an athlete ignores or trashes an activity
 * is almost always a sync artefact — a duplicate, a commute auto-imported as a
 * run, a walk inflating the weekly load — so the list of exclusions is read in
 * the same context as the source that produced them.
 */
export function SettingsDataSection() {
  return (
    <div className="space-y-6">
      <DataSources />
      <FlaggedActivitiesSection />
    </div>
  );
}
