import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * 合并类名，并把本项目的自定义字号认成字号。
 *
 * `tailwind-merge` 默认把任何 `text-*` 都当成文字颜色，于是 `text-title1`
 * 会被 `text-accent-strong` 顶掉——字号没了，字就退回 15px。
 * 这个仓库的字号令牌全部带自定义名字（`text-title1`、`text-caption1`、
 * `text-conclusion` 等），所以这里把它们显式登记成字号组，
 * 合并时颜色与字号各管各的。
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "metric-xl",
            "metric-lg",
            "conclusion",
            "display-xl",
            "display-lg",
            "display-md",
            "display-sm",
            "largeTitle",
            "title1",
            "title2",
            "title3",
            "headline",
            "body",
            "callout",
            "subheadline",
            "footnote",
            "caption1",
            "caption2",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
