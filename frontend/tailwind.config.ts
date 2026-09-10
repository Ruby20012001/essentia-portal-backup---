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
        // Every token resolves through a CSS variable holding "R G B", so a
        // theme is a different set of variables rather than a different set of
        // classes. Nothing in the markup has to know which theme is on.
        //
        // The channels are bare numbers so Tailwind's opacity modifiers still
        // compose — text-secondary/60 and bg-hover/40 keep working exactly as
        // they did when these were hex.
        canvas: "rgb(var(--c-canvas) / <alpha-value>)",
        card: "rgb(var(--c-card) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        "line-strong": "rgb(var(--c-line-strong) / <alpha-value>)",
        hover: "rgb(var(--c-hover) / <alpha-value>)",
        selected: "rgb(var(--c-selected) / <alpha-value>)",
        secondary: "rgb(var(--c-secondary) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        success: "rgb(var(--c-success) / <alpha-value>)",
        warning: "rgb(var(--c-warning) / <alpha-value>)",
        error: "rgb(var(--c-error) / <alpha-value>)",

        // The brand bar stays dark in both themes. It carries the white
        // wordmark, and a logo that disappears in one theme is not a theme.
        espresso: "#000000",
        cream: "#FFFFFF",

        ink: "rgb(var(--c-ink) / <alpha-value>)",
        paper: "rgb(var(--c-card) / <alpha-value>)",
        label: "rgb(var(--c-secondary) / <alpha-value>)",
        forest: "rgb(var(--c-success) / <alpha-value>)",
        navy: "rgb(var(--c-navy) / <alpha-value>)",
        alert: "rgb(var(--c-error) / <alpha-value>)",
        amber: "rgb(var(--c-amber) / <alpha-value>)",
        "amber-deep": "rgb(var(--c-amber-deep) / <alpha-value>)",

        // 209 places say text-white and mean "the primary text colour", and 36
        // say bg-white and mean "inverted". Rather than rewrite every one of
        // them and risk missing some, white and black are redefined to mean
        // foreground and background — which is what they were already being
        // used for. In dark they are still #FFF and #000.
        white: "rgb(var(--c-ink) / <alpha-value>)",
        black: "rgb(var(--c-canvas) / <alpha-value>)",
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
