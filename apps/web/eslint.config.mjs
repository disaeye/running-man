import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      complexity: "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "import/no-cycle": "error",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    // Build output directories. Each producer builds into its own so a running
    // server never loses the chunks it is serving; they are generated code and
    // must stay out of lint the same way `.next` does.
    ".next-gate/**",
    ".next-build/**",
    ".next-prev-*/**",
    ".omo/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    ".react-doctor/**",
  ]),
]);

export default eslintConfig;
