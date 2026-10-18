import type { Metadata } from "next";

/**
 * Sign-in and registration are not content: indexing them wastes crawl budget
 * on a form and would surface a sign-in page in results.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

/**
 * Auth shell — one centred card on the plain canvas.
 *
 * Must NOT use `.shell-chrome-row` (that is the dashboard horizontal flex).
 */
export default function AuthLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-surface-base px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span
            className="grid size-7 place-items-center rounded-lg bg-primary text-on-primary"
            aria-hidden="true"
          >
            <span className="size-1.5 rounded-full bg-on-primary" />
          </span>
          <span className="shell-title text-title3 font-semibold text-text-primary">
            Running Man
          </span>
        </div>
        <main className="w-full rounded-xl border border-border-subtle bg-surface-card p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
