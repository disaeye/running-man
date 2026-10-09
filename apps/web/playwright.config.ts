import { defineConfig, devices } from "@playwright/test";
import { AUTH_FILE } from "./e2e/auth";

const BASE_URL = "http://localhost:28801";
const VISUAL_BASELINE_PATH =
  "{testDir}/../../../.omo/evidence/visual-audit-v1/visual-baseline/{projectName}/{arg}{ext}";

const VIEWPORTS = [
  { name: "mobile", viewport: { width: 375, height: 812 } },
  { name: "tablet", viewport: { width: 768, height: 1024 } },
  { name: "desktop", viewport: { width: 1280, height: 800 } },
] as const;

const THEMES = ["light", "dark"] as const;

const visualProjects = VIEWPORTS.flatMap(({ name, viewport }) =>
  THEMES.map((theme) => ({
    name: `visual-${name}-${theme}`,
    testMatch: /visual-baseline\.spec\.ts/,
    use: {
      ...devices["Desktop Chrome"],
      colorScheme: theme,
      viewport,
    },
  })),
);

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    ["list"],
  ],
  expect: {
    toHaveScreenshot: {
      pathTemplate: VISUAL_BASELINE_PATH,
      threshold: 0.2,
    },
  },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  projects: [
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      testIgnore: /visual-baseline\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH_FILE,
      },
      dependencies: ["auth-setup"],
    },
    ...visualProjects.map((project) => ({
      ...project,
      use: {
        ...project.use,
        storageState: AUTH_FILE,
      },
      dependencies: ["auth-setup"],
    })),
  ],
});
