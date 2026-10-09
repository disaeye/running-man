"use client";
import { use } from "react";

import { ShareContent } from "@features/share/components/ShareContent";

export default function SharePage({
  params,
}: {
  readonly params: Promise<{ readonly token: string }>;
}) {
  const { token } = use(params);
  return <ShareContent token={token} />;
}
