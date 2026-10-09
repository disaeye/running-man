import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // v5: Apple voice. SF Pro on Apple platforms → Inter off-platform.
        // `font-serif` is repointed to the same sans stack so legacy heading
        // classes resolve to tight-tracked sans (Apple headlines are never serif).
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
        serif: ["var(--font-sans)"],
      },
      colors: {
        "ctl-blue": "#0066cc",
        "atl-magenta": "#8742AF",
        "tsb-gold": "#946018",
      },
    },
  },
};

export default config;
