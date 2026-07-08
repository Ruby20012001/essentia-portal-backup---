import type { Config } from "tailwindcss";

/**
 * Cold Coffee palette — CLAUDE.md brand rules. These names deliberately
 * shadow Tailwind's built-in scales (amber etc.): brand colours are flat
 * values and must never drift into off-brand shades.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        espresso: "#1C1714",
        cream: "#F4F2F0",
        amber: "#A8895C",
        forest: "#2E5C3A",
        navy: "#2E3F6B",
        alert: "#B43232",
        label: "#6B6058",
        // Blueprint extension tokens — sanctioned neutrals from the board
        // blueprint's on-brand CSS, for surfaces and hairlines only.
        paper: "#FAF9F7",
        ink: "#2A2521",
        line: "#E3DCD3",
        "line-strong": "#D2C7B8",
        "amber-deep": "#8A6A3E",
      },
      fontFamily: {
        heading: ["var(--font-cormorant)", "serif"],
        body: ["var(--font-lato)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
