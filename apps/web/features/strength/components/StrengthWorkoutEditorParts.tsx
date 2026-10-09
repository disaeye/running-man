import type { Exercise } from "@features/strength/hooks/useExercises";

export interface DraftSet {
  id: string;
  weight_kg: string;
  reps: string;
  rpe: string;
}

export interface DraftExercise {
  id: string;
  exercise: Exercise;
  sets: DraftSet[];
}

interface DraftListProps {
  drafts: readonly DraftExercise[];
  onAddSet: (draftId: string) => void;
  onRemoveExercise: (draftId: string) => void;
  onRemoveSet: (draftId: string, setId: string) => void;
  onUpdateSet: (draftId: string, setId: string, field: keyof DraftSet, value: string) => void;
}

interface PickerProps {
  exercises: readonly Exercise[];
  loading: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
}

export function DraftExerciseList({
  drafts,
  onAddSet,
  onRemoveExercise,
  onRemoveSet,
  onUpdateSet,
}: DraftListProps) {
  if (drafts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center text-subheadline text-text-muted">
        点击下方按钮添加训练动作
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {drafts.map((draft, draftIndex) => (
        <div key={draft.id} className="rounded-lg border border-border-subtle bg-surface-raised shadow-card">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-active text-caption1 font-semibold text-text-primary">
                {draftIndex + 1}
              </span>
              <span className="text-subheadline font-semibold text-text-primary">{draft.exercise.name_cn}</span>
              <span className="text-caption1 text-text-muted">{draft.exercise.category}</span>
            </div>
            <IconButton label="移除动作" onClick={() => onRemoveExercise(draft.id)} iconPath="M18 6L6 18M6 6l12 12" />
          </div>
          <SetsTable draft={draft} onRemoveSet={onRemoveSet} onUpdateSet={onUpdateSet} />
          <div className="border-t border-border-subtle p-3">
            <button
              type="button"
              onClick={() => onAddSet(draft.id)}
              className="focus-ring inline-flex items-center gap-1 rounded-md border border-dashed border-border-strong px-3 py-1.5 text-caption1 font-medium text-text-secondary hover:bg-surface-overlay hover:text-text-primary transition-colors"
            >
              <PlusIcon />
              添加组
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SetsTable({
  draft,
  onRemoveSet,
  onUpdateSet,
}: {
  draft: DraftExercise;
  onRemoveSet: (draftId: string, setId: string) => void;
  onUpdateSet: (draftId: string, setId: string, field: keyof DraftSet, value: string) => void;
}) {
  return (
    <div className="px-4 pt-3">
      <table className="w-full border-collapse text-subheadline">
        <thead>
          <tr className="text-caption1 text-text-muted border-b border-border-subtle">
            <th className="px-2 py-1 text-center font-medium w-8">组</th>
            <th className="px-1 py-1 text-right font-medium">重量(kg)</th>
            <th className="px-1 py-1 text-right font-medium">次数</th>
            <th className="px-1 py-1 text-right font-medium">RPE</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {draft.sets.map((set, setIndex) => (
            <tr key={set.id} className="border-b border-border-subtle">
              <td className="px-2 py-2 text-center text-caption1 font-medium text-text-muted">{setIndex + 1}</td>
              <SetInput value={set.weight_kg} placeholder="kg" step="0.5" min="0" onChange={(value) => onUpdateSet(draft.id, set.id, "weight_kg", value)} />
              <SetInput value={set.reps} placeholder="次" min="1" max="50" onChange={(value) => onUpdateSet(draft.id, set.id, "reps", value)} />
              <SetInput value={set.rpe} placeholder="RPE" step="0.5" min="1" max="10" onChange={(value) => onUpdateSet(draft.id, set.id, "rpe", value)} />
              <td className="px-1 py-2 text-right">
                <IconButton
                  label="删除这组"
                  onClick={() => onRemoveSet(draft.id, set.id)}
                  iconPath="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SetInput({ value, placeholder, min, max, step, onChange }: {
  value: string;
  placeholder: string;
  min: string;
  max?: string;
  step?: string;
  onChange: (value: string) => void;
}) {
  return (
    <td className="px-1 py-2">
      <input
        type="number"
        inputMode={step ? "decimal" : "numeric"}
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="focus-ring w-full rounded border border-border-subtle bg-surface-overlay px-2 py-1 text-right font-mono text-subheadline text-text-primary hover:border-border-default focus:border-accent focus:outline-none"
      />
    </td>
  );
}

export function ExercisePickerOverlay({ exercises, loading, query, onQueryChange, onSelect, onClose }: PickerProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-border-default bg-surface-raised shadow-elevated max-h-[70vh] flex flex-col">
        <div className="border-b border-border-subtle px-4 py-3">
          <h3 className="text-callout font-semibold text-text-primary">选择动作</h3>
          <input
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索动作..."
            autoFocus
            className="focus-ring mt-2 w-full rounded-md border border-border-subtle bg-surface-overlay px-3 py-2 text-subheadline text-text-primary placeholder:text-text-muted hover:border-border-default focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <ExercisePickerBody exercises={exercises} loading={loading} onSelect={onSelect} />
        </div>
      </div>
    </div>
  );
}

function ExercisePickerBody({ exercises, loading, onSelect }: Pick<PickerProps, "exercises" | "loading" | "onSelect">) {
  if (loading) return <div className="py-8 text-center text-subheadline text-text-muted">加载中...</div>;
  if (exercises.length === 0) return <div className="py-8 text-center text-subheadline text-text-muted">无匹配动作</div>;
  return (
    <ul className="flex flex-col gap-1">
      {exercises.map((exercise) => (
        <li key={exercise.id}>
          <button type="button" onClick={() => onSelect(exercise)} className="focus-ring w-full rounded-md px-3 py-2.5 text-left text-subheadline hover:bg-surface-overlay transition-colors">
            <span className="font-medium text-text-primary">{exercise.name_cn}</span>
            <span className="ml-2 text-caption1 text-text-muted">{exercise.category}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function IconButton({ label, iconPath, onClick }: { label: string; iconPath: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="focus-ring rounded p-1 text-text-muted hover:text-error transition-colors" aria-label={label}>
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={iconPath} />
      </svg>
    </button>
  );
}

function PlusIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
