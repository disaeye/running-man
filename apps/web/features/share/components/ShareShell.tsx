import type { ReactNode } from "react";

/**
 * The public page frame: no rail, no tabs, no navigation. A visitor with the
 * link sees the record and nothing else.
 */
export function ShareShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-surface-base px-4 py-10">
      <div className="w-full max-w-2xl">{children}</div>
      <p className="text-caption1 text-text-muted">Powered by Running Man</p>
    </div>
  );
}
