import { HomePortrait } from "@features/today/components/HomePortrait";

/**
 * Today page — decision-first athlete portrait.
 *
 * The page answers one question, so it renders one answer block with its
 * evidence inside it, then the two panels needed to act on that answer. Small
 * screens get the same order in one column.
 */
export default function DashboardPage() {
  return <HomePortrait />;
}
