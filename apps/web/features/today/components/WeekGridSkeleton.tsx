/**
 * Placeholder for `WeeklyHorizonMatrix` before it hydrates.
 *
 * The week grid is anchored to today and the page is statically pre-rendered,
 * so computing its dates during render baked the build day into the HTML: a
 * build made on Sep 13 served a grid starting 09-13 with "today" on the 13th
 * for as long as that build lived. The server also runs in UTC while athletes
 * read in Asia/Shanghai, so even a fresh build disagreed with the browser at
 * hydration (React reports that as a text mismatch, error 418).
 *
 * The grid now renders client-only and this is what the pre-rendered HTML
 * carries instead: seven cards matching the real grid's geometry, so the week
 * row does not change height when the dates appear.
 */
export function WeekGridSkeleton() {
  return (
    <div
      className="mt-4 -mx-1 flex gap-2 px-1 pb-2 sm:grid sm:grid-cols-7 sm:overflow-visible sm:pb-0"
      data-testid="week-grid-skeleton"
    >
      {Array.from({ length: 7 }, (_, i) => (
        <div
          key={i}
          className="min-w-[7.5rem] animate-pulse rounded-lg border border-border-subtle bg-surface-overlay/60 p-3"
        >
          <div className="h-3 w-10 rounded bg-surface-sunken" />
          <div className="mt-2 h-5 w-6 rounded bg-surface-sunken" />
          <div className="mt-3 h-4 w-full rounded bg-surface-sunken" />
        </div>
      ))}
    </div>
  );
}
