import type { Config } from "tailwindcss";

// Design tokens — inspired by Ticketbox's warm red/orange-on-white energy
// (docs/spec/05-project-structure-and-tech-stack.md §2 picked Tailwind)
// but with this project's own palette, not a copy of their exact brand.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // 4.5 isn't in Tailwind's default spacing scale (jumps 4 -> 5) — several
      // hand-written icons in this codebase use h-4.5/w-4.5 for an 18px size
      // in between those two, which silently generated no CSS at all without
      // this and fell back to the browser's default SVG size (~300x150px).
      spacing: {
        "4.5": "1.125rem",
      },
      colors: {
        brand: {
          50: "#FFF3EE",
          100: "#FFE3D6",
          200: "#FFC4AC",
          300: "#FF9E78",
          400: "#FF6F42",
          500: "#E8462A", // primary
          600: "#CC3620",
          700: "#A8291A",
          800: "#7E1F15",
          900: "#571510",
        },
        ink: {
          50: "#F5F6FA",
          100: "#E9EBF3",
          200: "#CDD1E1",
          300: "#A6ACC4",
          400: "#7A81A0",
          500: "#565D7D",
          600: "#3D4360",
          700: "#2A2E45",
          800: "#1B1E30",
          900: "#11121D",
        },
        gold: {
          400: "#FFC94A",
          500: "#F5B21B",
        },
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(17,18,29,.04), 0 8px 24px -12px rgba(17,18,29,.16)",
        pop: "0 4px 12px -2px rgba(232,70,42,.35)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
