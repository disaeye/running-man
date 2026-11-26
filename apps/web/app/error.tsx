"use client";

import Link from "next/link";
import { Button } from "@shared/ui/button";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-surface-base px-4 text-center">
      <h1 className="text-title3 font-semibold text-text-primary">出错了</h1>
      <p className="max-w-md text-subheadline text-text-secondary">
        页面加载时发生错误，请重试或返回首页。
      </p>
      {error?.message ? (
        <p className="max-w-md text-caption1 text-text-muted">{error.message}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={reset}>
          重试
        </Button>
        <Button asChild variant="outline">
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    </div>
  );
}
