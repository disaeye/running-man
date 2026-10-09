import type { ReactNode } from "react";

export function ShareShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-surface-base px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        {children}
      </div>
      <p className="text-caption1 text-text-muted">Powered by Running Man</p>
    </div>
  );
}
