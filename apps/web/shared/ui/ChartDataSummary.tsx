"use client";

import { useId, useState } from "react";

export interface ChartSummaryItem {
  readonly label: string;
  readonly start: string;
  /** 最显著拐点的读数与横轴位置；单调序列没有拐点。 */
  readonly turning: string | null;
  readonly end: string;
  readonly points: number;
}

/**
 * 图表的文本替代层。
 *
 * SVG 图表对读屏与键盘都不可达，所以每条序列在这里给出一份文字摘要：
 * 读屏用户直接读到首尾值与拐点，键盘用户按「查看数据」展开一张可见的
 * 读数表。两者读同一份摘要，不会各说各话。
 */
export function ChartDataSummary({ items }: { items: readonly ChartSummaryItem[] }) {
  const [open, setOpen] = useState(false);
  const tableId = useId();
  if (items.length === 0) return null;

  return (
    <div className="text-caption1">
      <dl className="sr-only" aria-label="图表数据摘要">
        {items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>
              起点 {item.start}，终点 {item.end}，共 {item.points} 个数据点
              {item.turning ? `，拐点 ${item.turning}` : ""}
            </dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={tableId}
        onClick={() => setOpen((value) => !value)}
        data-testid="chart-data-summary-toggle"
        className="tactile focus-ring min-h-11 rounded-full px-2 text-caption1 text-text-muted hover:text-text-primary"
      >
        {open ? "收起数据" : "查看数据"}
      </button>
      {open ? (
        <table id={tableId} data-testid="chart-data-table" className="mt-2 w-full text-left">
          <thead>
            <tr className="text-text-muted">
              <th scope="col" className="font-normal">序列</th>
              <th scope="col" className="font-normal">起点</th>
              <th scope="col" className="font-normal">拐点</th>
              <th scope="col" className="font-normal">终点</th>
              <th scope="col" className="font-normal">点数</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.label} className="border-t border-border-subtle">
                <td className="py-1 pr-2 text-text-primary">{item.label}</td>
                <td className="num py-1 pr-2 text-text-secondary">{item.start}</td>
                <td className="num py-1 pr-2 text-text-secondary">{item.turning ?? "无"}</td>
                <td className="num py-1 pr-2 text-text-secondary">{item.end}</td>
                <td className="num py-1 text-text-secondary">{item.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
