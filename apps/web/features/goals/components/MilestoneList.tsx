"use client";

import { useState } from "react";
import { Check, Circle, Pencil, Plus } from "lucide-react";
import { Badge } from "@shared/ui/Badge";
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

  const upcoming = milestones.filter((milestone) => !milestone.achieved);
  const achieved = milestones.filter((milestone) => milestone.achieved);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h3 className="eyebrow">里程碑</h3><Button variant="ghost" size="sm" disabled={saving} onClick={() => { setCreating(true); setEditingId(null); setError(null); }}><Plus aria-hidden="true" className="size-4" />添加</Button></div>
      <div className="space-y-3">
        {error ? <p role="alert" className="text-caption1 text-error">{error}</p> : null}
        {milestones.length === 0 && !creating ? (
          <p className="text-caption1 text-text-muted">还没有里程碑</p>
        ) : null}
        {creating ? (
          <MilestoneEditor
            initial={null}
            goalUnit={goalUnit}
            saving={saving}
            onCancel={() => setCreating(false)}
            onSave={(draft) => save(null, draft)}
          />
        ) : null}
        {upcoming.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {upcoming.map((milestone) => (
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
        {achieved.length > 0 ? (
          <div className="space-y-2 border-t border-border-subtle pt-4">
            <h3 className="text-caption1 font-medium text-text-muted">已完成</h3>
            <ul className="flex flex-col gap-2">
              {achieved.map((milestone) => (
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
          </div>
        ) : null}
      </div>
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
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-surface-sunken px-4 py-3">
      {milestone.achieved ? (
        <Check aria-hidden="true" className="size-4 text-success" />
      ) : (
        <Circle aria-hidden="true" className="size-4 text-text-muted" />
      )}
      <span className="min-w-0 flex-1 text-subheadline text-text-primary">{milestone.title}</span>
      {milestone.target_value != null ? (
        <span className="font-mono text-caption1 text-text-secondary">
          {milestone.target_value}{displayUnit ? ` ${displayUnit}` : ""}
        </span>
      ) : null}
      {milestone.target_date ? (
        <span className="text-caption1 text-text-muted">{formatDate(milestone.target_date)}</span>
      ) : null}
      {milestone.result_text ? (
        <span className="text-caption1 text-text-secondary">结果：{milestone.result_text}</span>
      ) : null}
      {!milestone.achieved ? (
        <Button variant="outline" size="sm" disabled={saving} onClick={() => void onToggle()}>
          标记完成
        </Button>
      ) : (
        <Badge variant="success">已完成</Badge>
      )}
      <Button variant="ghost" size="icon" aria-label={`编辑${milestone.title}`} onClick={onEdit}>
        <Pencil aria-hidden="true" className="size-4" />
      </Button>
    </li>
  );
}
