import { type HTMLAttributes } from "react";
import { Sparkles } from "lucide-react";
import { Card } from "@shared/ui/Card";

type AiPlaceholderVariant = "insight" | "chart-comment" | "coach-message" | "strength-comment";

interface AiPlaceholderProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AiPlaceholderVariant;
}

const variantDescriptions: Record<AiPlaceholderVariant, string> = {
  insight: "接入后将根据你的训练数据给出个性化建议",
  "chart-comment": "接入后将解读此图表趋势",
  "coach-message": "接入后可对话咨询训练问题",
  "strength-comment": "接入后将分析你的力量训练",
};

export function AiPlaceholder({ variant = "insight", className = "", ...props }: AiPlaceholderProps) {
  return (
    <Card padding="md" className={`flex flex-col items-center justify-center gap-3 border-insight-border bg-insight-bg text-center ${className}`.trim()} {...props}>
      <span className="grid size-10 place-items-center rounded-full border border-primary/30 bg-primary/10 text-primary" aria-hidden="true"><Sparkles className="size-4" /></span>
      <h3 className="text-callout font-semibold text-text-primary">AI 教练功能开发中</h3>
      <p className="text-caption1 text-text-secondary">敬请期待</p>
      <p className="max-w-xs text-caption1 leading-relaxed text-text-secondary">{variantDescriptions[variant]}</p>
    </Card>
  );
}
