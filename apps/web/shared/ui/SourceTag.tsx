import { Tag, type TagTone } from "@shared/ui/Badge";

/**
 * 数据来源标签。
 *
 * device=设备同步，manual=人工设置，estimate=系统估算。
 */
export type SourceKind = "device" | "manual" | "estimate";

const SOURCE_LABELS: Record<SourceKind, string> = {
  device: "设备同步",
  manual: "人工设置",
  estimate: "系统估算",
};

const SOURCE_TONE: Record<SourceKind, TagTone> = {
  device: "info",
  manual: "muted",
  estimate: "warn",
};

export function SourceTag({ source }: { source: SourceKind }) {
  return <Tag tone={SOURCE_TONE[source]}>{SOURCE_LABELS[source]}</Tag>;
}
