import { HomePortrait } from "@features/today/components/HomePortrait";

/**
 * Today page — decision-first athlete portrait.
 *
 * The desktop surface is an asymmetric bento: the decision panel carries
 * the main column, recovery signals form a tall rail, and load/week context
 * plus recent sessions create a compact evidence field underneath. On small
 * screens the same priority order collapses to one readable column.
 */
export default function DashboardPage() {
  return <HomePortrait />;
}
