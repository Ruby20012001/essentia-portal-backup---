import type { Config } from "tailwindcss";

/**
 * Essentia Portal — premium dark theme (executive/luxury). Single source of
 * truth for colour, typography, radius and spacing tokens. Classic-black canvas,
 * flat surfaces, hairline borders, Lato throughout. Semantic tokens (canvas /
 * card / surface / line / hover / selected / secondary / muted / success /
 * warning / error) are the sanctioned way to colour any surface or text.
 *
 * The original Cold Coffee token NAMES are retained and remapped to their dark
 * equivalents so existing markup stays on-theme without a churn of renames:
 *   espresso → black surface · cream → white text · paper → card · ink → white
 *   line → hairline · label → secondary text.
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
        // ---- Semantic dark-theme tokens (prefer these going forward) ----
        canvas: "#000000", // app + page background
        card: "#0D0D0D", // cards, panels, alternate rows
        surface: "#111111", // elevated surfaces, table headers
        line: "#1E1E1E", // hairline borders
        "line-strong": "#2A2A2A", // input borders
        hover: "#171717", // row / control hover
        selected: "#202020", // selected nav / active state
        secondary: "#B5B5B5", // secondary text
        muted: "#7A7A7A", // muted / tertiary text
        success: "#2E7D32",
        warning: "#FFB300",
        error: "#D32F2F",

        // ---- Retained brand names, remapped to the dark palette ----
        espresso: "#000000", // was dark surface → now black surface
        cream: "#FFFFFF", // was light surface → now white (text on dark)
        ink: "#FFFFFF", // primary text
        paper: "#0D0D0D", // card surface
        label: "#B5B5B5", // secondary/label text
        forest: "#2E7D32", // success
        navy: "#3B5BA8", // informational (readable on black)
        alert: "#D32F2F", // error
        // Essentia signature gold — kept as an available accent token.
        amber: "#A8895C",
        "amber-deep": "#C6A06A", // lighter gold, legible on black
      },
      fontFamily: {
        // Lato only — headings and body share the family (weights differ).
        heading: ["var(--font-lato)", "sans-serif"],
        body: ["var(--font-lato)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
