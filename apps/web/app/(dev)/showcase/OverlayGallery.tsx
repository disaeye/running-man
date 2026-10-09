"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@shared/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@shared/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@shared/ui/tooltip";
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { Button } from "@shared/ui/button";
import { SectionHeader } from "@shared/ui/SectionHeader";

export function OverlayGallery() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <SectionHeader title="Dialog" subtitle="Click to open" />
        <div className="mt-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>对话框标题</DialogTitle>
                <DialogDescription>
                  这是对话框的描述内容，用于解释操作的目的和影响。
                </DialogDescription>
              </DialogHeader>
              <p className="text-subheadline text-text-secondary">
                对话框主体内容区域。
              </p>
              <DialogFooter>
                <Button variant="outline">取消</Button>
                <Button>确认</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div>
        <SectionHeader title="Sheet" subtitle="Side panel — all 4 sides" />
        <div className="mt-4 flex flex-wrap gap-3">
          {(["right", "left", "top", "bottom"] as const).map((side) => (
            <Sheet key={side}>
              <SheetTrigger asChild>
                <Button variant="outline">Sheet ({side})</Button>
              </SheetTrigger>
              <SheetContent side={side}>
                <SheetHeader>
                  <SheetTitle>{side} 面板</SheetTitle>
                  <SheetDescription>从{side === "right" ? "右" : side === "left" ? "左" : side === "top" ? "上" : "下"}侧滑入的面板</SheetDescription>
                </SheetHeader>
                <div className="px-4 text-subheadline text-text-secondary">
                  面板内容
                </div>
              </SheetContent>
            </Sheet>
          ))}
        </div>
      </div>

      <div>
        <SectionHeader title="Tooltip" subtitle="Hover to reveal" />
        <div className="mt-4 flex flex-wrap gap-3">
          <TooltipProvider>
            {(["top", "right", "bottom", "left"] as const).map((side) => (
              <Tooltip key={side}>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm">Tooltip ({side})</Button>
                </TooltipTrigger>
                <TooltipContent side={side}>
                  <p>提示内容 — {side}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>
      </div>

      <div>
        <SectionHeader title="ConfirmDialog" subtitle="Destructive confirmation" />
        <div className="mt-4">
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            删除活动
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="确认删除"
            description="此操作不可撤销，确定要删除这条活动记录吗？"
            confirmLabel="删除"
            onConfirm={() => setConfirmOpen(false)}
          />
        </div>
      </div>
    </div>
  );
}
