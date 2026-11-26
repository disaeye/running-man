"use client";

import { Suspense, useRef, useState, type MouseEvent } from "react";
import { Plus } from "lucide-react";
import { useSWRConfig } from "swr";
import { PageHeader } from "@shared/ui/PageHeader";
import { Button } from "@shared/ui/button";
import {
  invalidateDataCards,
  invalidatePlanDependents,
} from "@features/data/lib/invalidate-after-sync";
import { PlanGenerateDialog } from "@features/plan/components/PlanGenerateDialog";
import { useProfile } from "@features/settings/hooks/useProfile";
import { TrainingTabs } from "./TrainingTabs";
import { TrainingAddFab } from "./TrainingAddFab";
import { TrainingAddSheet } from "./TrainingAddSheet";
import { useTrainingAddDefaults } from "../lib/training-add-defaults";

/**
 * 训练工作区外壳：页头「训练」、二级导航，以及整个工作区唯一的「添加训练」入口
 * （桌面端在页头右侧，移动端是右下角 FAB）。三个页面只渲染自己的内容。
 */
export function TrainingShell({ children }: { readonly children: React.ReactNode }) {
  const { mutate } = useSWRConfig();
  const { profile } = useProfile();
  const [addOpen, setAddOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const addTrigger = useRef<HTMLButtonElement | null>(null);
  const generatePending = useRef(false);
  const openAdd = (event: MouseEvent<HTMLButtonElement>) => {
    addTrigger.current = event.currentTarget;
    setAddOpen(true);
  };
  const handleAddClosed = (event: Event) => {
    event.preventDefault();
    if (generatePending.current) {
      generatePending.current = false;
      setGenerateOpen(true);
    } else {
      addTrigger.current?.focus();
    }
  };
  const reload = () => void invalidateDataCards(mutate);

  return (
    <div className="page-stack" data-testid="training-shell">
      <PageHeader
        title="训练"
        action={
          <Button
            type="button"
            className="hidden sm:inline-flex"
            onClick={openAdd}
            data-testid="training-add-button"
          >
            <Plus className="size-4" aria-hidden="true" />
            添加训练
          </Button>
        }
        className="mb-2 border-b border-border-subtle pb-3"
      >
        <TrainingTabs className="mt-1" />
      </PageHeader>
      <div className="space-y-4">{children}</div>

      <TrainingAddFab onClick={openAdd} />
      <Suspense fallback={null}>
        <TrainingAddLayer
          open={addOpen}
          onOpenChange={setAddOpen}
          onOpenGenerate={() => { generatePending.current = true; }}
          onCloseAutoFocus={handleAddClosed}
          onSaved={reload}
        />
      </Suspense>
      <PlanGenerateDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={async () => {
          await invalidatePlanDependents(mutate);
          await invalidateDataCards(mutate);
        }}
        trainingDays={profile?.weekly_training_days ?? undefined}
      />
    </div>
  );
}

function TrainingAddLayer({
  open,
  onOpenChange,
  onOpenGenerate,
  onCloseAutoFocus,
  onSaved,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onOpenGenerate: () => void;
  readonly onCloseAutoFocus: (event: Event) => void;
  readonly onSaved: () => void;
}) {
  const defaults = useTrainingAddDefaults();
  return (
    <TrainingAddSheet
      open={open}
      date={defaults.date}
      defaultSport={defaults.sport}
      onOpenChange={onOpenChange}
      onOpenGenerate={onOpenGenerate}
      onCloseAutoFocus={onCloseAutoFocus}
      onSaved={onSaved}
    />
  );
}
