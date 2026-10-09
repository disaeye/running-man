import type { Metadata } from "next";

/**
 * Metadata for the public marketing surface.
 *
 * The landing page previously inherited the root layout's placeholder
 * ("Running Man" / "Personal running & fitness platform"), so a shared link
 * showed a product name and a generic subtitle rather than telling anyone what
 * the thing does. This describes it in the product's own words.
 *
 * The dashboard and auth routes deliberately do not get this treatment: they
 * are private, so `noindex` keeps them out of search results instead of
 * advertising pages nobody can open.
 */
const TITLE = "Running Man · 训练有迹可循";
const DESCRIPTION =
  "把训练、恢复与目标组织成一条可执行的路径：训练负荷与恢复状态可见，"
  + "今天该做什么一目了然。个人耐力训练系统。";

export const metadata: Metadata = {
  title: {
    default: TITLE,
    template: "%s · Running Man",
  },
  description: DESCRIPTION,
  applicationName: "Running Man",
  keywords: ["跑步", "训练负荷", "恢复", "耐力训练", "PMC", "训练计划"],
  openGraph: {
    type: "website",
    siteName: "Running Man",
    title: TITLE,
    description: DESCRIPTION,
    locale: "zh_CN",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
