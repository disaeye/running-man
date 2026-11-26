"use client";

import { Plus } from "lucide-react";
import type { MouseEventHandler } from "react";

/** 移动端的单一添加入口：点击直接拉起「添加训练」抽屉，没有二级菜单。 */
export function TrainingAddFab({ onClick }: { readonly onClick: MouseEventHandler<HTMLButtonElement> }) {
  return (
    <button
      type="button"
      aria-label="添加训练"
      data-testid="training-add-fab"
      onClick={onClick}
      className="tactile fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-panel sm:hidden"
    >
      <Plus className="h-6 w-6" aria-hidden="true" />
    </button>
  );
}
