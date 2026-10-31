import { Page } from "@shared/ui/Lovable";
import { StrengthOverview } from "@features/strength/components/StrengthOverview";
import { StrengthTabContent } from "@features/strength/components/StrengthTabContent";

export default function StrengthPage() {
  return <Page title="力量" eyebrow="动作 · 肌群负荷 · e1RM"><StrengthOverview /><StrengthTabContent /></Page>;
}
