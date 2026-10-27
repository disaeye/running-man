import type { Metadata } from "next";

/**
 * Sign-in and registration are not content: indexing them wastes crawl budget
 * on a form and would surface a sign-in page in results.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

/**
 * Auth shell: the lavender field on the left carries the product's one claim,
 * the white card on the right carries the form. Below 1024px the field folds
 * away and the card stands alone, with the wordmark above it.
 *
 * Must NOT use `.shell-chrome-row` (that is the dashboard horizontal flex).
 */
export default function AuthLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] w-full bg-surface-base">
      <aside className="hidden w-[38%] max-w-[30rem] flex-col justify-between bg-rail p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <span
            className="grid size-7 place-items-center rounded-lg bg-primary text-on-primary"
            aria-hidden="true"
          >
            <span className="size-1.5 rounded-full bg-on-primary" />
          </span>
          <span className="shell-title text-title3 font-semibold text-text-primary">Running Man</span>
        </div>

        <div className="max-w-sm">
          <p className="text-display-sm font-semibold tracking-tight text-text-primary">
            把训练数据变成今天的决定
          </p>
          <p className="mt-3 text-subheadline leading-relaxed text-text-secondary">
            从 Intervals.icu 导入活动，算出体能、疲劳与状态，然后给出今天该练什么。
          </p>
        </div>

        <p className="text-caption1 text-text-muted">数据来源 Intervals.icu · 每个数字可追溯到算法版本</p>
      </aside>

      <main className="flex w-full flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span
              className="grid size-7 place-items-center rounded-lg bg-primary text-on-primary"
              aria-hidden="true"
            >
              <span className="size-1.5 rounded-full bg-on-primary" />
            </span>
            <span className="shell-title text-title3 font-semibold text-text-primary">Running Man</span>
          </div>
          <div className="w-full rounded-2xl bg-surface-card p-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
