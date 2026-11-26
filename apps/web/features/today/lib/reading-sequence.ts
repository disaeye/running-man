const played = new Set<string>();
const previousByOwner = new Map<string, string>();

export type ReadingKind = "first" | "updated" | "static";

export function readingKind(owner: string, key: string | null, reduced: boolean): ReadingKind {
  if (!key || reduced) return "static";
  const previous = previousByOwner.get(owner);
  previousByOwner.set(owner, key);
  if (previous && previous !== key) return "updated";
  if (played.has(key)) return "static";
  played.add(key);
  return "first";
}
