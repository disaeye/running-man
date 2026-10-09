import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**/*.spec.ts", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      "@shared": resolve(__dirname, "shared"),
      "@features": resolve(__dirname, "features"),
    },
  },
});
