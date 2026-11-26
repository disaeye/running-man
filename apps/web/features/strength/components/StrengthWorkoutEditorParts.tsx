import type { Exercise } from "@features/strength/hooks/useExercises";
import { PageCard } from "@shared/ui/Card";

export interface DraftSet {
  id: string;
  weight_kg: string;
  reps: string;
  rpe: string;
  completed: boolean;
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
  onUpdateSet: (draftId: string, setId: string, field: keyof DraftSet, value: string | boolean) => void;
}

interface PickerProps {
  exercises: readonly Exercise[];
  loading: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
}

export function DraftExerciseList({ drafts, onAddSet, onRemoveExercise, onRemoveSet, onUpdateSet }: DraftListProps) {
  if (drafts.length === 0) return <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">点击下方按钮添加训练动作</div>;
  return <div className="space-y-3">{drafts.map((draft) => <PageCard key={draft.id} title={draft.exercise.name_cn} action={<button type="button" onClick={() => onRemoveExercise(draft.id)} className="text-xs text-muted-foreground">移除</button>}>
    <div className="space-y-2">{draft.sets.map((set, setIndex) => <div key={set.id} className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2"><span className="num w-6 text-sm text-muted-foreground">{setIndex + 1}</span><SetInput label="重量" value={set.weight_kg} placeholder="kg" onChange={(value) => onUpdateSet(draft.id, set.id, "weight_kg", value)} /><SetInput label="次数" value={set.reps} placeholder="次" onChange={(value) => onUpdateSet(draft.id, set.id, "reps", value)} /><SetInput label="RPE" value={set.rpe} placeholder="RPE" onChange={(value) => onUpdateSet(draft.id, set.id, "rpe", value)} /><input type="checkbox" checked={set.completed} onChange={(event) => onUpdateSet(draft.id, set.id, "completed", event.target.checked)} aria-label={`第 ${setIndex + 1} 组已完成`} className="size-4 accent-primary" /><button type="button" onClick={() => onRemoveSet(draft.id, set.id)} className="text-xs text-muted-foreground" aria-label="删除这组">×</button></div>)}</div>
    <div className="mt-3 flex justify-between text-xs"><button type="button" onClick={() => onAddSet(draft.id)} className="text-accent-strong">+ 添加组</button><span className="text-muted-foreground">{`${draft.sets.length} 组`}</span></div>
  </PageCard>)}</div>;
}

function SetInput({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return <input type="number" inputMode="decimal" min="0" step="0.5" value={value} placeholder={placeholder} aria-label={label} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-right text-sm num outline-none focus:border-primary" />;
}

export function ExercisePickerOverlay({ exercises, loading, query, onQueryChange, onSelect, onClose }: PickerProps) {
  return <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true"><div className="absolute inset-0 bg-black/60" onClick={onClose} /><PageCard className="relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col" title="选择动作" action={<button type="button" onClick={onClose} className="text-xs text-muted-foreground">关闭</button>}><input type="text" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索动作..." autoFocus className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none" /><div className="mt-2 overflow-y-auto">{loading ? <p className="py-8 text-center text-sm text-muted-foreground">加载中...</p> : exercises.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">无匹配动作</p> : exercises.map((exercise) => <button key={exercise.id} type="button" onClick={() => onSelect(exercise)} className="flex w-full justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-secondary"><span>{exercise.name_cn}</span><span className="text-xs text-muted-foreground">{exercise.category}</span></button>)}</div></PageCard></div>;
}
