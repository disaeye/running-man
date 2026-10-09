"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-surface-base px-4">
      <h1 className="text-title3 font-semibold text-text-primary">出错了</h1>
      <p className="text-subheadline text-text-secondary">页面加载时发生错误，请重试。</p>
      <button
        onClick={reset}
        className="focus-ring rounded-md bg-accent px-4 py-2 text-subheadline font-medium text-accent-foreground transition-colors hover:bg-accent/90"
      >
        重试
      </button>
    </div>
  );
}
