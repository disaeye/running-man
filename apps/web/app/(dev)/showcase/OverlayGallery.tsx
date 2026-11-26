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
import { ConfirmDialog } from "@shared/ui/ConfirmDialog";
import { Button } from "@shared/ui/button";
import { ShowcaseHeading } from "./ShowcaseHeading";

export function OverlayGallery() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <ShowcaseHeading title="Dialog" subtitle="Click to open" />
        <div className="mt-4">
          <Dialog>
            <DialogTrigger asChild><Button variant="outline">Open Dialog</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>对话框标题</DialogTitle>
                <DialogDescription>这是对话框的描述内容，用于解释操作的目的和影响。</DialogDescription>
              </DialogHeader>
              <p className="text-subheadline text-text-secondary">对话框主体内容区域。</p>
              <DialogFooter>
                <Button variant="outline">取消</Button>
                <Button>确认</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div>
        <ShowcaseHeading title="Sheet" subtitle="Side panel — all 4 sides" />
        <div className="mt-4 flex flex-wrap gap-3">
          {(["right", "left", "top", "bottom"] as const).map((side) => (
            <Sheet key={side}>
              <SheetTrigger asChild><Button variant="outline">Sheet ({side})</Button></SheetTrigger>
              <SheetContent side={side}>
                <SheetHeader>
                  <SheetTitle>{side} 面板</SheetTitle>
                  <SheetDescription>抽屉面板演示</SheetDescription>
                </SheetHeader>
                <div className="px-4 text-subheadline text-text-secondary">面板内容</div>
              </SheetContent>
            </Sheet>
          ))}
        </div>
      </div>

      <div>
        <ShowcaseHeading title="ConfirmDialog" subtitle="Destructive confirmation" />
        <div className="mt-4">
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>删除活动</Button>
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
