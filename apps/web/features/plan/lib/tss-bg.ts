/**
 * Map a TSS value to a Tailwind accent-opacity background class.
 *
 * `isFuture` lowers the opacity tiers so planned (not yet completed)
 * workouts render visually lighter than completed ones at the same TSS.
 */
export function tssBg(tss: number, isFuture = false): string {
  if (tss <= 0) return "";
  if (isFuture) {
    if (tss < 50) return "bg-accent/5";
    if (tss < 100) return "bg-accent/10";
    if (tss < 150) return "bg-accent/20";
    if (tss < 200) return "bg-accent/30";
    return "bg-accent/40";
  }
  if (tss < 50) return "bg-accent/10";
  if (tss < 100) return "bg-accent/25";
  if (tss < 150) return "bg-accent/40";
  if (tss < 200) return "bg-accent/60";
  return "bg-accent/80";
}
