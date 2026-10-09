"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Card } from "@shared/ui/Card";
import { Button } from "@shared/ui/button";
import { logout } from "@shared/lib/auth";

/**
 * Sign-out control.
 *
 * ``logout()`` had been in the auth library with no caller: the account section
 * used to render a component that was later orphaned and deleted, and nothing
 * replaced it. The only way to end a session was to clear the cookie by hand.
 * An end-to-end test still expected the button, which is how it surfaced.
 */
export function SettingsSignOut() {
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await logout();
    } finally {
      // Navigate regardless: if the request failed the cookie may still be
      // present, but leaving the user on a page they asked to leave is worse
      // than a stale cookie the middleware will reject on the next request.
      router.push("/login");
    }
  };

  return (
    <Card padding="sm">
      <h3 className="text-headline font-semibold text-text-primary">会话</h3>
      <p className="mt-1 text-caption1 text-text-muted">
        退出后需要重新登录才能访问训练数据。
      </p>
      <Button
        variant="secondary"
        className="mt-3 gap-2"
        onClick={() => void handleSignOut()}
      >
        <LogOut className="size-4" aria-hidden="true" />
        退出登录
      </Button>
    </Card>
  );
}
