"use client";

import { useState } from "react";
import { Check, Circle, Pencil, Plus } from "lucide-react";
import { Button } from "@shared/ui/button";
import { formatDate } from "@shared/lib/format";
import type { Milestone } from "@shared/types/goals";
import type { MilestoneDraft } from "@features/goals/hooks/useGoals";
import { MilestoneEditor } from "@features/goals/components/MilestoneEditor";

interface MilestoneListProps {
  milestones: Milestone[];
  onToggle: (milestoneId: string) => Promise<void>;
  onSave: (milestoneId: string | null, draft: MilestoneDraft) => Promise<void>;
  goalUnit?: string | null;
}

export function MilestoneList({
  milestones,
  onToggle,
  onSave,
  goalUnit,
}: MilestoneListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (milestoneId: string | null, draft: MilestoneDraft) => {
    setSaving(true);
    setError(null);
    try {
      await onSave(milestoneId, draft);
      setEditingId(null);
      setCreating(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存里程碑失败");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (milestoneId: string) => {
    setSaving(true);
    setError(null);
    try {
      await onToggle(milestoneId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新里程碑状态失败");
    } finally {
      setSaving(false);
    }
  };

  const ordered = [...milestones].sort((left, right) => {
    if (left.achieved !== right.achieved) return left.achieved ? 1 : -1;
    const leftDate = left.target_date ?? "9999-12-31";
    const rightDate = right.target_date ?? "9999-12-31";
    return leftDate.localeCompare(rightDate);
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <Button variant="ghost" size="sm" disabled={saving} onClick={() => { setCreating(true); setEditingId(null); setError(null); }}>
          <Plus aria-hidden="true" className="size-4" />添加
        </Button>
      </div>
      {error ? <p role="alert" className="mb-2 text-caption1 text-error">{error}</p> : null}
      {ordered.length === 0 && !creating ? <p className="text-caption1 text-text-muted">还没有里程碑</p> : null}
      {creating ? (
        <MilestoneEditor
          initial={null}
          goalUnit={goalUnit}
          saving={saving}
          onCancel={() => setCreating(false)}
          onSave={(draft) => save(null, draft)}
        />
      ) : null}
      {ordered.length > 0 ? (
        <ul className="flex flex-col">
          {ordered.map((milestone) => (
            <MilestoneRow
              key={milestone.milestone_id}
              milestone={milestone}
              goalUnit={goalUnit}
              saving={saving}
              editing={editingId === milestone.milestone_id}
              onToggle={() => toggle(milestone.milestone_id)}
              onEdit={() => {
                setCreating(false);
                setEditingId(milestone.milestone_id);
                setError(null);
              }}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(draft) => save(milestone.milestone_id, draft)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MilestoneRow({
  milestone,
  goalUnit,
  saving,
  editing,
  onToggle,
  onEdit,
  onCancelEdit,
  onSaveEdit,
}: {
  milestone: Milestone;
  goalUnit?: string | null;
  saving: boolean;
  editing: boolean;
  onToggle: () => Promise<void>;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (draft: MilestoneDraft) => Promise<void>;
}) {
  if (editing) {
    return (
      <li>
        <MilestoneEditor
          initial={milestone}
          goalUnit={goalUnit}
          saving={saving}
          onCancel={onCancelEdit}
          onSave={onSaveEdit}
        />
      </li>
    );
  }

  const displayUnit = milestone.unit || goalUnit;
  return (
    <li className="flex items-center gap-3 border-b border-border-subtle py-3 last:border-b-0">
      <button
        type="button"
        onClick={() => void onToggle()}
        disabled={saving}
        aria-label={milestone.achieved ? `取消完成${milestone.title}` : `标记完成${milestone.title}`}
        className="focus-ring shrink-0 rounded-full p-0.5"
      >
        {milestone.achieved ? (
          <Check aria-hidden="true" className="size-4 text-success" />
        ) : (
          <Circle aria-hidden="true" className="size-4 text-text-muted" />
        )}
      </button>
      <span className="min-w-0 flex-1 text-subheadline text-text-primary">{milestone.title}</span>
      {milestone.target_value != null ? (
        <span className="num text-caption1 text-text-secondary">
          {milestone.target_value}{displayUnit ? ` ${displayUnit}` : ""}
        </span>
      ) : null}
      {milestone.target_date ? (
        <span className="text-caption1 text-text-muted">{formatDate(milestone.target_date)}</span>
      ) : null}
      <Button variant="ghost" size="icon" aria-label={`编辑${milestone.title}`} onClick={onEdit}>
        <Pencil aria-hidden="true" className="size-4" />
      </Button>
    </li>
  );
}
