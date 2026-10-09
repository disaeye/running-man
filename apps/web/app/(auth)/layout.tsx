import type { Metadata } from "next";
import Link from "next/link";

/**
 * Login and registration are not content: indexing them wastes crawl budget on
 * a form and would surface a sign-in page in results. The public landing page
 * carries the marketing metadata instead.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};


/**
 * Auth shell — centered card over winter atmosphere.
 * Must NOT use `.shell-chrome-row` (dashboard horizontal flex).
 */
export default function AuthLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <div className="shell-atmosphere relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden px-4 py-10 sm:py-12">
      <div className="shell-orbs" aria-hidden="true" />
      <div className="shell-horizon" aria-hidden="true" />
      <div className="shell-grain" aria-hidden="true" />
      <div className="shell-chrome relative z-[2] flex w-full max-w-md flex-col items-stretch">
        <Link href="/landing" className="focus-ring mb-8 self-center rounded-lg px-2 py-1" aria-label="Running Man，返回首页">
          <div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-[10px] bg-primary text-on-primary shadow-[0_0_20px_rgba(90,111,154,.25)]" aria-hidden="true"><span className="size-2 rounded-full bg-on-primary" /></span><span className="shell-title text-title2 font-semibold text-text-primary">Running Man</span></div>
          <p className="mt-2 text-center font-mono text-caption2 uppercase tracking-[0.22em] text-text-muted">ENDURANCE / OS</p>
        </Link>
        <main className="glass-surface w-full rounded-xl p-6 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
