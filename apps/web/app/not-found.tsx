import Link from "next/link";
import { MapPinX } from "lucide-react";

import { Button } from "@shared/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-surface-base px-4">
      <MapPinX className="size-10 text-text-muted" aria-hidden="true" />
      <div className="text-center">
        <h1 className="text-display-sm font-semibold tracking-tight text-text-primary">
          404 — 页面不存在
        </h1>
        <p className="mt-2 text-body text-text-secondary">
          你访问的页面可能已被移动或删除。
        </p>
      </div>
      <Button asChild>
        <Link href="/">返回首页</Link>
      </Button>
    </main>
  );
}
