import { test, expect, type Page } from "@playwright/test";

/**
 * 锁住首页的阅读顺序。
 *
 * 页面先展示今天的训练安排，再列出恢复状态和身体读数；随后展示本周跑量与最近训练。
 * 所以这个顺序在手机上也不变。
 *
 * 主要内容按 testid 定位，布局调整后仍检查训练与恢复的阅读顺序。
 */

const BLOCKS = ["home-workout", "home-recovery", "home-load", "home-week-progress"] as const;

async function blockTops(page: Page) {
  return page.evaluate((ids) => {
    const out: Record<string, number> = {};
    for (const id of ids) {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (element) out[id] = Math.round(element.getBoundingClientRect().top);
    }
    return out;
  }, [...BLOCKS]);
}

test.describe("home page information flow", () => {
  // Pinned rather than inherited: "is it on the first screen" is only
  // meaningful against a known viewport height.
  test.use({ viewport: { width: 1440, height: 900 } });

  test("today's workout is the first-screen focal point @smoke", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);

    const shellHeight = await page.evaluate(() => window.innerHeight);

    // An account with no history has nothing to decide, so the page shows the
    // starting point instead. Asserting a reading strip there would demand a
    // wall of dashes.
    const starting = await page.getByTestId("home-starting-point").count();
    if (starting > 0) {
      const top = await page.evaluate(
        () =>
          Math.round(
            document
              .querySelector('[data-testid="home-starting-point"]')!
              .getBoundingClientRect().top,
          ),
      );
      expect(top, "starting point must be on the first screen").toBeLessThan(shellHeight);
      return;
    }

    const layout = await page.evaluate(() => {
      const box = (id: string) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), left: Math.round(r.left), bottom: Math.round(r.bottom) };
      };
      return { workout: box("home-workout"), recovery: box("home-recovery") };
    });

    expect(layout.workout, "today's workout card must render").not.toBeNull();
    const workoutBox = layout.workout!;
    if (layout.recovery) {
      expect(workoutBox.top, "today's workout must start at or above recovery").toBeLessThanOrEqual(
        layout.recovery.top,
      );
      if (workoutBox.top === layout.recovery.top) {
        expect(
          workoutBox.left,
          "today's workout must lead in the left primary column",
        ).toBeLessThan(layout.recovery.left);
      }
    }
    expect(workoutBox.bottom, "the workout hero must fit on the first screen").toBeLessThan(
      shellHeight,
    );
  });

  test("narrow screens show the workout before recovery", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);

    const tops = await blockTops(page);
    const present = BLOCKS.filter((id) => id in tops);

    if (present.length === 0) {
      // Empty account: the starting point replaces the data blocks entirely.
      await expect(page.getByTestId("home-starting-point")).toBeVisible();
      return;
    }
    expect(present).toEqual([...BLOCKS]);
    for (let index = 1; index < present.length; index += 1) {
      const previous = present[index - 1]!;
      const current = present[index]!;
      expect(
        tops[current],
        `${current} must come after ${previous} in reading order`,
      ).toBeGreaterThan(tops[previous]!);
    }
  });
});

test.describe("profile notices", () => {
  // 通知区呈现：未读通知从 notifications API 进「我的」页，一条一行，看了即消。
  // 页面只展示当天生成或需要处理（warning / error）的提醒，往日的信息类提醒不再出现。
  // 走真实 API（本套件全部真库运行），先读接口按同一规则算出应出现的条数再断言页面行为。
  test("unread notices render in the strip and dismiss on read", async ({ page }) => {
    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);

    const strip = page.getByTestId("profile-notices");
    const response = await page.request.get("/api/v1/notifications?unread_only=true");
    expect(response.status()).toBe(200);
    const unread = (await response.json()) as { body: string | null; created_at: string; severity: string; title: string }[];
    const athlete = await (await page.request.get("/api/v1/athletes/me")).json();
    const dayKey = (instant: string) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: athlete.timezone as string, year: "numeric", month: "2-digit", day: "2-digit" })
        .format(new Date(instant));
    const relevant = unread
      .filter(
        (notice) => notice.severity !== "info" || dayKey(notice.created_at) === dayKey(new Date().toISOString()),
      )
      // 同一天内重复生成的同文提醒在页面上合并成一条。
      .filter((notice, index, all) => all.findIndex((other) => other.title === notice.title && other.body === notice.body) === index);

    if (relevant.length === 0) {
      // 没有需要展示的提醒时通知区不渲染——空态诚实。
      await expect(strip).toHaveCount(0);
      return;
    }

    // 渐进式披露：默认仅展示最高优先级 1 条；「知道了」标记已读后该条消失（后面有则补位）。
    await expect(strip).toBeVisible();
    const items = strip.getByRole("listitem");
    expect(await items.count()).toBe(1);

    if (relevant.length > 1) {
      await strip.getByRole("button", { name: /展开其余/ }).click();
      expect(await items.count()).toBe(Math.min(relevant.length, 5));
    }

    const dismissedText = (await items.first().innerText()).replaceAll("\n", "").trim();
    await items.first().getByRole("button", { name: "知道了" }).click();
    await expect(strip.locator("li", { hasText: dismissedText.slice(0, 24) })).toHaveCount(0);
  });
});
